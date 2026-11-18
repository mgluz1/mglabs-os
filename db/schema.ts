import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// PostGIS geography(Point, 4326). Lido/escrito como WKT ("SRID=4326;POINT(lng lat)").
const geographyPoint = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geography(Point, 4326)";
  },
});

// Lugares: do Google, guardar permanentemente só google_place_id.
// Os demais campos google_* são cache com validade (google_cached_until).
export const places = pgTable(
  "places",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 'overture' (dados abertos, pode guardar) ou 'google' (cache com validade). */
    source: text("source").default("google"),
    overtureId: text("overture_id").unique(),
    googlePlaceId: text("google_place_id").unique(),
    website: text("website"),
    phone: text("phone"),
    confidence: numeric("confidence"),
    sourceCount: integer("source_count"),
    name: text("name"),
    primaryType: text("primary_type"),
    category: text("category"),
    address: text("address"),
    neighborhood: text("neighborhood"),
    city: text("city"),
    geom: geographyPoint("geom"),
    rating: numeric("rating"),
    ratingCount: integer("rating_count"),
    businessStatus: text("business_status"),
    googlePhone: text("google_phone"),
    googleWebsite: text("google_website"),
    googleMapsUri: text("google_maps_uri"),
    googleCachedUntil: timestamp("google_cached_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("places_geom_idx").using("gist", t.geom),
    index("places_name_trgm_idx").using("gin", sql`${t.name} gin_trgm_ops`),
  ],
);

// Contatos extraídos do site da própria empresa (podem ficar guardados).
export const placeContacts = pgTable(
  "place_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    placeId: uuid("place_id").references(() => places.id, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: ["whatsapp", "phone", "email", "instagram", "facebook", "site"],
    }),
    value: text("value"),
    source: text("source", { enum: ["site_empresa", "google_places", "overture", "manual"] }),
    confirmed: boolean("confirmed").default(false),
    collectedAt: timestamp("collected_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [unique("place_contacts_place_kind_value_uq").on(t.placeId, t.kind, t.value)],
);

export const siteAudits = pgTable("site_audits", {
  id: uuid("id").primaryKey().defaultRandom(),
  placeId: uuid("place_id")
    .unique()
    .references(() => places.id, { onDelete: "cascade" }),
  url: text("url"),
  siteType: text("site_type"),
  https: boolean("https"),
  viewport: boolean("viewport"),
  psiPerformance: integer("psi_performance"),
  psiSeo: integer("psi_seo"),
  hasServicesPage: boolean("has_services_page"),
  hasBooking: boolean("has_booking"),
  hasWhatsappButton: boolean("has_whatsapp_button"),
  signals: jsonb("signals"),
  status: text("status").default("pending"),
  error: text("error"),
  approachable: boolean("approachable"),
  auditedAt: timestamp("audited_at", { withTimezone: true }).defaultNow(),
});

export const leadScores = pgTable("lead_scores", {
  placeId: uuid("place_id")
    .primaryKey()
    .references(() => places.id, { onDelete: "cascade" }),
  total: integer("total"),
  blockA: integer("block_a"),
  blockB: integer("block_b"),
  blockC: integer("block_c"),
  blockD: integer("block_d"),
  rules: jsonb("rules"),
  weightsVersion: text("weights_version"),
  scoredAt: timestamp("scored_at", { withTimezone: true }).defaultNow(),
});

export const searches = pgTable("searches", {
  id: uuid("id").primaryKey().defaultRandom(),
  category: text("category"),
  center: geographyPoint("center"),
  radiusM: integer("radius_m"),
  label: text("label"),
  status: text("status").default("done"),
  error: text("error"),
  apiCalls: integer("api_calls"),
  results: integer("results"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const leads = pgTable("leads", {
  id: uuid("id").primaryKey().defaultRandom(),
  placeId: uuid("place_id")
    .unique()
    .references(() => places.id),
  stage: text("stage").default("novo"),
  offer: text("offer"),
  expectedValue: numeric("expected_value"),
  nextStep: text("next_step"),
  nextStepAt: timestamp("next_step_at", { withTimezone: true }),
  lostReason: text("lost_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const activities = pgTable("activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
  kind: text("kind"),
  channel: text("channel"),
  content: text("content"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const optouts = pgTable("optouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  phone: text("phone"),
  googlePlaceId: text("google_place_id"),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const apiUsage = pgTable(
  "api_usage",
  {
    month: text("month").notNull(),
    endpoint: text("endpoint").notNull(),
    calls: integer("calls").default(0),
  },
  (t) => [primaryKey({ columns: [t.month, t.endpoint] })],
);

// Quais lugares cada busca trouxe (a tela do radar lista por busca).
export const searchResults = pgTable(
  "search_results",
  {
    searchId: uuid("search_id")
      .notNull()
      .references(() => searches.id, { onDelete: "cascade" }),
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.searchId, t.placeId] })],
);

// Lugares do Overture Maps (CDLA Permissive 2.0 / Apache 2.0) para a região de Goiânia.
// Carregado pela GitHub Action "overture-ingest". Base própria: pode ficar guardada.
export const ovPlaces = pgTable(
  "ov_places",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    basicCategory: text("basic_category"),
    taxonomyPrimary: text("taxonomy_primary"),
    hierarchy: text("hierarchy").array(),
    alternates: text("alternates").array(),
    brand: text("brand"),
    confidence: numeric("confidence"),
    operatingStatus: text("operating_status"),
    websites: text("websites").array(),
    socials: text("socials").array(),
    emails: text("emails").array(),
    phones: text("phones").array(),
    address: text("address"),
    locality: text("locality"),
    postcode: text("postcode"),
    sourceCount: integer("source_count"),
    geom: geographyPoint("geom"),
    release: text("release"),
    loadedAt: timestamp("loaded_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("ov_places_geom_idx").using("gist", t.geom),
    index("ov_places_basic_idx").on(t.basicCategory),
    index("ov_places_primary_idx").on(t.taxonomyPrimary),
    index("ov_places_hierarchy_idx").using("gin", t.hierarchy),
  ],
);
