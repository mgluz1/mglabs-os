import "server-only";

import { sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db";
import { parseBrPhone } from "@/lib/phone";
import type { Activity, Contact, LeadCard, RadarPlace } from "@/lib/types";

type Row = {
  id: string;
  google_place_id: string;
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
  opted_out: boolean;
};

// Base: lugar + análise + nota + contatos do site + lead + opt-out.
const BASE = sql`
  select p.id, p.google_place_id, p.name, p.category, p.address, p.neighborhood, p.city,
         ST_Y(p.geom::geometry) as lat, ST_X(p.geom::geometry) as lng,
         p.rating::text as rating, p.rating_count, p.google_phone, p.google_website, p.google_maps_uri,
         a.status as audit_status, a.site_type, a.https, a.viewport, a.psi_performance, a.has_booking,
         a.has_services_page, a.approachable, a.signals,
         s.total as score, s.rules,
         (select coalesce(jsonb_agg(jsonb_build_object('kind', c.kind, 'value', c.value, 'source', c.source, 'confirmed', c.confirmed)
                 order by c.confirmed desc, c.kind), '[]'::jsonb)
            from place_contacts c where c.place_id = p.id) as contacts,
         l.id as lead_id, l.stage as lead_stage,
         exists(select 1 from optouts o
                where o.google_place_id = p.google_place_id
                   or (o.phone is not null and (o.phone = p.google_phone
                       or o.phone in (select c2.value from place_contacts c2 where c2.place_id = p.id)))) as opted_out
  from places p
  left join site_audits a on a.place_id = p.id
  left join lead_scores s on s.place_id = p.id
  left join leads l on l.place_id = p.id`;

function toPlace(r: Row): RadarPlace {
  const contacts: Contact[] = [...(r.contacts ?? [])];
  const gp = parseBrPhone(r.google_phone);
  if (gp && !contacts.some((c) => (c.kind === "phone" || c.kind === "whatsapp") && c.value === gp.e164)) {
    contacts.push({ kind: gp.mobile ? "whatsapp" : "phone", value: gp.e164, source: "google_places", confirmed: false });
  }
  if (r.google_website && r.site_type === "site_proprio") {
    contacts.push({ kind: "site", value: r.google_website, source: "google_places", confirmed: false });
  }
  return {
    id: r.id,
    googlePlaceId: r.google_place_id,
    name: r.name ?? "(sem nome)",
    category: r.category,
    address: r.address,
    neighborhood: r.neighborhood,
    city: r.city,
    lat: Number(r.lat),
    lng: Number(r.lng),
    rating: r.rating == null ? null : Number(r.rating),
    ratingCount: r.rating_count,
    googlePhone: r.google_phone,
    googleWebsite: r.google_website,
    googleMapsUri: r.google_maps_uri,
    auditStatus: r.audit_status,
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
    optedOut: r.opted_out,
  };
}

async function list(where: SQL, opts: { includeOptedOut?: boolean } = {}): Promise<RadarPlace[]> {
  const { rows } = await db.execute<Row>(sql`${BASE} ${where} order by s.total desc nulls last, p.name`);
  return rows.filter((r) => r.lat != null && (opts.includeOptedOut || !r.opted_out)).map(toPlace);
}

export async function searchResults(searchId: string) {
  const places = await list(sql`where p.id in (select place_id from search_results where search_id = ${searchId})`);
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
  return { search: rows[0] ?? null, places, pending };
}

export async function recentSearches(limit = 8) {
  const { rows } = await db.execute<{ id: string; category: string; radius_m: number; label: string | null; results: number; created_at: string }>(
    sql`select id, category, radius_m, label, results, created_at from searches order by created_at desc limit ${limit}`,
  );
  return rows;
}

export async function placeById(placeId: string): Promise<RadarPlace | null> {
  const r = await list(sql`where p.id = ${placeId}`, { includeOptedOut: true });
  return r[0] ?? null;
}

export async function activitiesFor(leadId: string): Promise<Activity[]> {
  const { rows } = await db.execute<{ id: string; kind: string | null; channel: string | null; content: string | null; created_at: string }>(
    sql`select id, kind, channel, content, created_at from activities where lead_id = ${leadId} order by created_at desc limit 100`,
  );
  return rows.map((r) => ({ id: r.id, kind: r.kind, channel: r.channel, content: r.content, createdAt: new Date(r.created_at).toISOString() }));
}

export async function crmBoard(): Promise<LeadCard[]> {
  const { rows } = await db.execute<
    Row & { l_offer: string | null; l_value: string | null; l_next_step: string | null; l_next_at: string | null; l_lost: string | null }
  >(sql`
    select b.*, l.offer as l_offer, l.expected_value::text as l_value, l.next_step as l_next_step,
           l.next_step_at as l_next_at, l.lost_reason as l_lost
    from (${BASE}) b join leads l on l.id = b.lead_id
    order by l.next_step_at asc nulls last, l.updated_at desc`);
  return rows.map((r) => ({
    id: r.lead_id!,
    stage: r.lead_stage ?? "novo",
    offer: r.l_offer,
    expectedValue: r.l_value == null ? null : Number(r.l_value),
    nextStep: r.l_next_step,
    nextStepAt: r.l_next_at ? new Date(r.l_next_at).toISOString() : null,
    lostReason: r.l_lost,
    place: toPlace(r),
  }));
}
