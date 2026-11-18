import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
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
  overtureId: text("overture_id"),
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

// =====================================================================
// MGLABS OS — entidades do CRM (docs/CRM-MGLABS-OS-PRD.md §4).
// Valores em BRL sempre em centavos (bigint). Datas em timestamptz (UTC).
// As tabelas antigas (leads, activities) ficam intactas: a migração 0005 copia
// os dados para estas (legacy_lead_id / legacy_activity_id) sem apagar nada.
// =====================================================================

const ts = (name: string) => timestamp(name, { withTimezone: true });
const cents = (name: string) => bigint(name, { mode: "number" });

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: ts("created_at").defaultNow().notNull(),
});

/** Papéis: owner, admin, comercial, producao, financeiro. */
export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    email: text("email"),
    role: text("role").notNull().default("owner"),
    createdAt: ts("created_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

/** Tokens do servidor MCP. Só o hash é guardado; o valor aparece uma única vez na criação. */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    scope: text("scope").notNull().default("read"), // read | write
    expiresAt: ts("expires_at"),
    lastUsedAt: ts("last_used_at"),
    revokedAt: ts("revoked_at"),
    createdAt: ts("created_at").defaultNow().notNull(),
  },
  (t) => [index("api_tokens_ws_idx").on(t.workspaceId)],
);

export const crmStages = pgTable(
  "crm_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    position: integer("position").notNull(),
    probability: integer("probability").notNull().default(0),
    kind: text("kind").notNull().default("open"), // open | won | lost
  },
  (t) => [unique("crm_stages_ws_key_uq").on(t.workspaceId, t.key)],
);

export const crmCompanies = pgTable(
  "crm_companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    status: text("status").notNull().default("lead"), // lead | cliente | inativo
    category: text("category"),
    website: text("website"),
    phone: text("phone"),
    email: text("email"),
    instagram: text("instagram"),
    address: text("address"),
    neighborhood: text("neighborhood"),
    city: text("city"),
    source: text("source").notNull().default("manual"), // radar | manual | indicacao | site | importacao
    /** Vínculo opcional com o Radar. Um negócio pode existir sem nenhum place. */
    placeId: uuid("place_id").references(() => places.id, { onDelete: "set null" }),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    notes: text("notes"),
    metadata: jsonb("metadata"),
    archivedAt: ts("archived_at"),
    createdAt: ts("created_at").defaultNow().notNull(),
    updatedAt: ts("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("crm_companies_ws_place_uq").on(t.workspaceId, t.placeId).where(sql`${t.placeId} is not null`),
    index("crm_companies_ws_idx").on(t.workspaceId),
    index("crm_companies_name_trgm_idx").using("gin", sql`${t.name} gin_trgm_ops`),
  ],
);

export const crmContacts = pgTable(
  "crm_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => crmCompanies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role"),
    email: text("email"),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    instagram: text("instagram"),
    preferredChannel: text("preferred_channel"), // whatsapp | email | ligacao | instagram
    source: text("source"),
    /** Pediu para não ser contatado. Bloqueia qualquer botão/sugestão de contato. */
    optedOut: boolean("opted_out").notNull().default(false),
    optedOutAt: ts("opted_out_at"),
    notes: text("notes"),
    lastContactAt: ts("last_contact_at"),
    createdAt: ts("created_at").defaultNow().notNull(),
    updatedAt: ts("updated_at").defaultNow().notNull(),
  },
  (t) => [index("crm_contacts_ws_company_idx").on(t.workspaceId, t.companyId)],
);

export const crmDeals = pgTable(
  "crm_deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull().references(() => crmCompanies.id, { onDelete: "cascade" }),
    primaryContactId: uuid("primary_contact_id").references(() => crmContacts.id, { onDelete: "set null" }),
    stageId: uuid("stage_id").notNull().references(() => crmStages.id),
    title: text("title").notNull(),
    serviceType: text("service_type"),
    estimatedValueCents: cents("estimated_value_cents"),
    /** Se nulo, usa a probabilidade da etapa. */
    probability: integer("probability"),
    source: text("source").notNull().default("manual"),
    ownerId: text("owner_id"),
    nextStep: text("next_step"),
    nextStepAt: ts("next_step_at"),
    expectedCloseAt: date("expected_close_at"),
    lostReason: text("lost_reason"),
    wonAt: ts("won_at"),
    lostAt: ts("lost_at"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    notes: text("notes"),
    lastActivityAt: ts("last_activity_at"),
    legacyLeadId: uuid("legacy_lead_id").unique(),
    createdAt: ts("created_at").defaultNow().notNull(),
    updatedAt: ts("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("crm_deals_ws_stage_idx").on(t.workspaceId, t.stageId),
    index("crm_deals_company_idx").on(t.companyId),
    index("crm_deals_next_step_idx").on(t.workspaceId, t.nextStepAt),
  ],
);

/** Histórico persistente. meta guarda antes/depois nas mudanças relevantes. */
export const crmActivities = pgTable(
  "crm_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id").references(() => crmDeals.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => crmCompanies.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => crmContacts.id, { onDelete: "set null" }),
    projectId: uuid("project_id"),
    kind: text("kind").notNull(), // nota | etapa | mensagem_enviada | ligacao | resposta | reuniao | tarefa | proposta | projeto | pagamento | optout | sistema
    channel: text("channel"),
    content: text("content"),
    meta: jsonb("meta"),
    authorId: text("author_id"),
    authorKind: text("author_kind").notNull().default("user"), // user | mcp | ia | sistema
    occurredAt: ts("occurred_at").defaultNow().notNull(),
    legacyActivityId: uuid("legacy_activity_id").unique(),
    createdAt: ts("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("crm_activities_deal_idx").on(t.dealId, t.occurredAt),
    index("crm_activities_company_idx").on(t.companyId, t.occurredAt),
    index("crm_activities_ws_idx").on(t.workspaceId, t.occurredAt),
  ],
);

export const crmTasks = pgTable(
  "crm_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    priority: text("priority").notNull().default("media"), // baixa | media | alta | urgente
    status: text("status").notNull().default("pendente"), // pendente | em_andamento | concluida | cancelada
    dueAt: ts("due_at"),
    completedAt: ts("completed_at"),
    dealId: uuid("deal_id").references(() => crmDeals.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => crmCompanies.id, { onDelete: "cascade" }),
    projectId: uuid("project_id"),
    assignedTo: text("assigned_to"),
    source: text("source").notNull().default("manual"), // manual | ia | mcp | automacao
    /** Evita duplicar tarefas geradas por automação (cron/cadência). */
    dedupeKey: text("dedupe_key"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").defaultNow().notNull(),
    updatedAt: ts("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("crm_tasks_ws_due_idx").on(t.workspaceId, t.status, t.dueAt),
    uniqueIndex("crm_tasks_dedupe_uq").on(t.workspaceId, t.dedupeKey).where(sql`${t.dedupeKey} is not null`),
  ],
);

export const crmMessageTemplates = pgTable("crm_message_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  objective: text("objective").notNull(),
  service: text("service"),
  tone: text("tone"),
  channel: text("channel").notNull().default("whatsapp"),
  body: text("body").notNull(),
  version: integer("version").notNull().default(1),
  active: boolean("active").notNull().default(true),
  createdAt: ts("created_at").defaultNow().notNull(),
  updatedAt: ts("updated_at").defaultNow().notNull(),
});

export const crmMessageDrafts = pgTable(
  "crm_message_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id").references(() => crmDeals.id, { onDelete: "set null" }),
    companyId: uuid("company_id").references(() => crmCompanies.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => crmContacts.id, { onDelete: "set null" }),
    objective: text("objective").notNull(),
    service: text("service"),
    tone: text("tone"),
    channel: text("channel").notNull().default("whatsapp"),
    body: text("body").notNull(),
    origin: text("origin").notNull().default("manual"), // manual | modelo | ia | mcp
    templateId: uuid("template_id").references(() => crmMessageTemplates.id, { onDelete: "set null" }),
    facts: jsonb("facts"),
    status: text("status").notNull().default("rascunho"), // rascunho | enviada | descartada
    sentAt: ts("sent_at"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").defaultNow().notNull(),
  },
  (t) => [index("crm_message_drafts_ws_idx").on(t.workspaceId, t.createdAt)],
);

export const crmServices = pgTable("crm_services", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  defaultScope: text("default_scope"),
  /** Referência comercial editável; nulo = a definir. Nunca é gravado como valor imutável em propostas. */
  basePriceCents: cents("base_price_cents"),
  estimatedDays: integer("estimated_days"),
  recurring: boolean("recurring").notNull().default(false),
  active: boolean("active").notNull().default(true),
  position: integer("position").notNull().default(0),
  createdAt: ts("created_at").defaultNow().notNull(),
  updatedAt: ts("updated_at").defaultNow().notNull(),
});

export const crmProposals = pgTable(
  "crm_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id").references(() => crmDeals.id, { onDelete: "set null" }),
    companyId: uuid("company_id").notNull().references(() => crmCompanies.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => crmContacts.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    status: text("status").notNull().default("rascunho"), // rascunho | enviada | visualizada | aprovada | recusada | expirada
    version: integer("version").notNull().default(1),
    previousId: uuid("previous_id"),
    diagnosis: text("diagnosis"),
    scope: text("scope"),
    deliverables: text("deliverables"),
    timeline: text("timeline"),
    revisionsIncluded: integer("revisions_included"),
    paymentTerms: text("payment_terms"),
    installments: integer("installments").notNull().default(1),
    discountCents: cents("discount_cents").notNull().default(0),
    validUntil: date("valid_until"),
    notes: text("notes"),
    totalCents: cents("total_cents").notNull().default(0),
    sentAt: ts("sent_at"),
    decidedAt: ts("decided_at"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").defaultNow().notNull(),
    updatedAt: ts("updated_at").defaultNow().notNull(),
  },
  (t) => [index("crm_proposals_ws_idx").on(t.workspaceId, t.status), index("crm_proposals_deal_idx").on(t.dealId)],
);

export const crmProposalItems = pgTable(
  "crm_proposal_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proposalId: uuid("proposal_id").notNull().references(() => crmProposals.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").references(() => crmServices.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPriceCents: cents("unit_price_cents").notNull().default(0),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("crm_proposal_items_idx").on(t.proposalId)],
);

export const crmProposalEvents = pgTable("crm_proposal_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  proposalId: uuid("proposal_id").notNull().references(() => crmProposals.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  note: text("note"),
  authorId: text("author_id"),
  createdAt: ts("created_at").defaultNow().notNull(),
});

export const crmProjects = pgTable(
  "crm_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull().references(() => crmCompanies.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id").references(() => crmDeals.id, { onDelete: "set null" }),
    proposalId: uuid("proposal_id").references(() => crmProposals.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    serviceType: text("service_type"),
    scope: text("scope"),
    status: text("status").notNull().default("planejado"), // planejado | em_andamento | em_revisao | pausado | entregue | cancelado
    phase: text("phase").notNull().default("briefing"), // briefing | materiais | direcao_criativa | desenvolvimento | entrega
    dueDate: date("due_date"),
    notes: text("notes"),
    /** [{label, url}] — referências, GitHub, preview. */
    links: jsonb("links").notNull().default(sql`'[]'::jsonb`),
    /** Texto de cada seção: briefing, materiais, direcao_criativa, desenvolvimento, entrega. */
    sections: jsonb("sections").notNull().default(sql`'{}'::jsonb`),
    deliveredAt: ts("delivered_at"),
    createdAt: ts("created_at").defaultNow().notNull(),
    updatedAt: ts("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("crm_projects_ws_idx").on(t.workspaceId, t.status),
    // conversão idempotente: um negócio gera no máximo um projeto
    uniqueIndex("crm_projects_deal_uq").on(t.dealId).where(sql`${t.dealId} is not null`),
  ],
);

export const crmProjectDocuments = pgTable("crm_project_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => crmProjects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  url: text("url"),
  kind: text("kind").notNull().default("documento"), // documento | referencia | material | entrega
  /** recebido | falta | a_produzir | nao_autorizado */
  rightsStatus: text("rights_status"),
  notes: text("notes"),
  createdAt: ts("created_at").defaultNow().notNull(),
});

export const crmReceivables = pgTable(
  "crm_receivables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull().references(() => crmCompanies.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => crmProjects.id, { onDelete: "set null" }),
    dealId: uuid("deal_id").references(() => crmDeals.id, { onDelete: "set null" }),
    proposalId: uuid("proposal_id").references(() => crmProposals.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    amountCents: cents("amount_cents").notNull(),
    dueDate: date("due_date").notNull(),
    installmentNo: integer("installment_no").notNull().default(1),
    installmentsTotal: integer("installments_total").notNull().default(1),
    /** aberta | cancelada. "paga/parcial/vencida" são derivadas dos pagamentos. */
    status: text("status").notNull().default("aberta"),
    notes: text("notes"),
    createdAt: ts("created_at").defaultNow().notNull(),
    updatedAt: ts("updated_at").defaultNow().notNull(),
  },
  (t) => [index("crm_receivables_ws_due_idx").on(t.workspaceId, t.dueDate)],
);

export const crmPayments = pgTable(
  "crm_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    receivableId: uuid("receivable_id").notNull().references(() => crmReceivables.id, { onDelete: "cascade" }),
    amountCents: cents("amount_cents").notNull(),
    paidAt: date("paid_at").notNull(),
    method: text("method"), // pix | boleto | cartao | transferencia | dinheiro | outro
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").defaultNow().notNull(),
  },
  (t) => [index("crm_payments_ws_idx").on(t.workspaceId, t.paidAt), index("crm_payments_rec_idx").on(t.receivableId)],
);

/** Base de conhecimento manual; preparada para sincronizar com o Second Brain (Obsidian). */
export const crmKnowledge = pgTable(
  "crm_knowledge",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("processo"), // template | referencia | processo | projeto | nota
    title: text("title").notNull(),
    body: text("body"),
    url: text("url"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    companyId: uuid("company_id").references(() => crmCompanies.id, { onDelete: "set null" }),
    /** manual | obsidian (futuro) */
    source: text("source").notNull().default("manual"),
    externalPath: text("external_path"),
    createdAt: ts("created_at").defaultNow().notNull(),
    updatedAt: ts("updated_at").defaultNow().notNull(),
  },
  (t) => [index("crm_knowledge_ws_idx").on(t.workspaceId, t.kind)],
);

export const crmAuditEvents = pgTable(
  "crm_audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    actor: text("actor"),
    actorKind: text("actor_kind").notNull().default("user"), // user | mcp | ia | sistema
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    meta: jsonb("meta"),
    createdAt: ts("created_at").defaultNow().notNull(),
  },
  (t) => [index("crm_audit_ws_idx").on(t.workspaceId, t.createdAt)],
);

/** Contador de chamadas de IA por dia/recurso (limites e custo). Sem conteúdo, sem dados pessoais. */
export const aiUsage = pgTable(
  "ai_usage",
  {
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    feature: text("feature").notNull(),
    calls: integer("calls").notNull().default(0),
    errors: integer("errors").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.day, t.feature] })],
);
