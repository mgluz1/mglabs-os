import "server-only";

import { sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db";
import { parseBrPhone } from "@/lib/phone";
import type { Contact, RadarPlace } from "@/lib/types";

type Row = {
  id: string;
  source: string | null;
  overture_id: string | null;
  google_place_id: string | null;
  website: string | null;
  phone: string | null;
  confidence: string | null;
  source_count: number | null;
  name: string | null;
  category: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  lat: number;
  lng: number;
  rating: string | null;
  rating_count: number | null;
  google_phone: string | null;
  google_website: string | null;
  google_maps_uri: string | null;
  audit_status: string | null;
  audit_error: string | null;
  audited_at: string | null;
  scored_at: string | null;
  site_type: RadarPlace["siteType"];
  https: boolean | null;
  viewport: boolean | null;
  psi_performance: number | null;
  has_booking: boolean | null;
  has_services_page: boolean | null;
  approachable: boolean | null;
  signals: { oldSite?: string[] } | null;
  score: number | null;
  rules: RadarPlace["rules"] | null;
  contacts: Contact[] | null;
  lead_id: string | null;
  lead_stage: string | null;
  company_id: string | null;
  company_metadata: { ignoredAt?: string | null; snoozeUntil?: string | null } | null;
  has_draft: boolean;
  opted_out: boolean;
};

// Base: lugar + análise + nota + contatos do site + negócio no CRM + opt-out.
// `ws` escopa a ligação com o CRM ao espaço de trabalho (lugares e notas são dados abertos compartilhados).
const base = (ws: string | null) => sql`
  select p.id, p.source, p.overture_id, p.google_place_id, p.website, p.phone, p.confidence::text as confidence, p.source_count, p.name, p.category, p.address, p.neighborhood, p.city,
         ST_Y(p.geom::geometry) as lat, ST_X(p.geom::geometry) as lng,
         p.rating::text as rating, p.rating_count, p.google_phone, p.google_website, p.google_maps_uri,
         a.status as audit_status, a.error as audit_error, a.audited_at, s.scored_at, a.site_type, a.https, a.viewport, a.psi_performance, a.has_booking,
         a.has_services_page, a.approachable, a.signals,
         s.total as score, s.rules,
         (select coalesce(jsonb_agg(jsonb_build_object('kind', c.kind, 'value', c.value, 'source', c.source, 'confirmed', c.confirmed)
                 order by c.confirmed desc, c.kind), '[]'::jsonb)
            from place_contacts c where c.place_id = p.id) as contacts,
         l.deal_id as lead_id, l.stage_key as lead_stage, l.company_id, l.company_metadata,
         ${ws ? sql`exists(select 1 from crm_message_drafts md where md.workspace_id = ${ws} and md.company_id = l.company_id and md.status = 'rascunho')` : sql`false`} as has_draft,
         exists(select 1 from optouts o
                where o.google_place_id = p.google_place_id
                   or o.overture_id = p.overture_id
                   or (o.phone is not null and (o.phone = p.google_phone or o.phone = p.phone
                       or o.phone in (select c2.value from place_contacts c2 where c2.place_id = p.id)))) as opted_out
  from places p
  left join site_audits a on a.place_id = p.id
  left join lead_scores s on s.place_id = p.id
  left join lateral (
    select d.id as deal_id, st.key as stage_key, c.id as company_id, c.metadata as company_metadata
    from crm_companies c
    left join crm_deals d on d.company_id = c.id
    left join crm_stages st on st.id = d.stage_id
    where ${ws ? sql`c.workspace_id = ${ws} and` : sql`false and`} c.place_id = p.id
    order by (st.kind = 'open') desc nulls last, d.updated_at desc nulls last
    limit 1
  ) l on true`;

function toPlace(r: Row): RadarPlace {
  const contacts: Contact[] = [...(r.contacts ?? [])];
  const isOv = r.source === "overture";
  // celular vira "provável WhatsApp"
  for (const c of contacts) if (c.kind === "phone" && parseBrPhone(c.value)?.mobile) c.kind = "whatsapp";
  const gp = parseBrPhone(r.phone ?? r.google_phone);
  if (gp && !contacts.some((c) => (c.kind === "phone" || c.kind === "whatsapp") && c.value === gp.e164)) {
    contacts.push({ kind: gp.mobile ? "whatsapp" : "phone", value: gp.e164, source: isOv ? "overture" : "google_places", confirmed: false });
  }
  const site = r.website ?? r.google_website;
  if (site && r.site_type === "site_proprio") {
    contacts.push({ kind: "site", value: site, source: isOv ? "overture" : "google_places", confirmed: false });
  }
  return {
    id: r.id,
    source: isOv ? "overture" : "google",
    overtureId: r.overture_id,
    googlePlaceId: r.google_place_id,
    confidence: r.confidence == null ? null : Number(r.confidence),
    sourceCount: r.source_count,
    name: r.name ?? "(sem nome)",
    category: r.category,
    address: r.address,
    neighborhood: r.neighborhood,
    city: r.city,
    lat: Number(r.lat),
    lng: Number(r.lng),
    rating: r.rating == null ? null : Number(r.rating),
    ratingCount: r.rating_count,
    googlePhone: r.phone ?? r.google_phone,
    googleWebsite: site,
    googleMapsUri: r.google_maps_uri,
    auditStatus: r.audit_status,
    auditError: r.audit_error ?? null,
    auditedAt: r.audited_at ? new Date(r.audited_at).toISOString() : null,
    scoredAt: r.scored_at ? new Date(r.scored_at).toISOString() : null,
    siteType: r.site_type,
    https: r.https,
    viewport: r.viewport,
    psiPerformance: r.psi_performance,
    hasBooking: r.has_booking,
    hasServicesPage: r.has_services_page,
    approachable: r.approachable,
    oldSite: r.signals?.oldSite ?? [],
    score: r.score,
    rules: r.rules ?? [],
    contacts,
    leadId: r.lead_id,
    leadStage: r.lead_stage,
    companyId: r.company_id,
    ignored: Boolean(r.company_metadata?.ignoredAt),
    snoozedUntil: r.company_metadata?.snoozeUntil ?? null,
    hasDraft: Boolean(r.has_draft),
    optedOut: r.opted_out,
  };
}

async function list(ws: string | null, where: SQL, opts: { includeOptedOut?: boolean } = {}): Promise<RadarPlace[]> {
  const { rows } = await db.execute<Row>(sql`${base(ws)} ${where} order by s.total desc nulls last, p.name`);
  return rows.filter((r) => r.lat != null && (opts.includeOptedOut || !r.opted_out)).map(toPlace);
}

export async function searchResults(searchId: string, ws: string | null = null) {
  const places = await list(ws, sql`where p.id in (select place_id from search_results where search_id = ${searchId})`);
  const { rows } = await db.execute<{
    id: string;
    category: string;
    radius_m: number;
    label: string | null;
    status: string;
    api_calls: number;
    results: number;
    lat: number;
    lng: number;
    created_at: string;
  }>(sql`select id, category, radius_m, label, status, api_calls, results, ST_Y(center::geometry) as lat, ST_X(center::geometry) as lng, created_at
          from searches where id = ${searchId}`);
  const pending = places.filter((p) => p.auditStatus === "pending" || p.auditStatus === "running").length;
  const failed = places.filter((p) => p.auditStatus === "error").length;
  return { search: rows[0] ?? null, places, pending, failed, hasMore: rows[0]?.status === "partial" };
}

export async function recentSearches(limit = 8) {
  const { rows } = await db.execute<{ id: string; category: string; radius_m: number; label: string | null; results: number; created_at: string }>(
    sql`select id, category, radius_m, label, results, created_at from searches order by created_at desc limit ${limit}`,
  );
  return rows;
}

export async function placeById(placeId: string, ws: string | null = null): Promise<RadarPlace | null> {
  const r = await list(ws, sql`where p.id = ${placeId}`, { includeOptedOut: true });
  return r[0] ?? null;
}
