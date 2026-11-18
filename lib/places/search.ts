import "server-only";

import { sql } from "drizzle-orm";

import { getCategory, type Category } from "@/lib/config/categories";
import { db } from "@/lib/db";
import { distanceM, type LatLng } from "@/lib/geo";
import { parseBrPhone } from "@/lib/phone";
import { isFranchise, nameSimilarity, neighborhoodFrom } from "@/lib/text";

// Busca na base aberta do Overture Maps (tabela ov_places, carregada pela GitHub Action).
// Sem custo por busca e sem restrição de mapa: os dados podem ser guardados e mostrados no OpenStreetMap.

const MAX_RESULTS = 600;

export type SearchRequest = { category: string; center: LatLng; radiusM: number; label?: string };

export type SearchOutcome =
  | { ok: true; searchId: string; found: number; kept: number; calls: number; partial: boolean; discarded: Record<string, number> }
  | { ok: false; error: string; estimate?: number; remaining?: number };

type OvRow = {
  id: string;
  name: string | null;
  brand: string | null;
  confidence: string | null;
  websites: string[] | null;
  socials: string[] | null;
  emails: string[] | null;
  phones: string[] | null;
  address: string | null;
  locality: string | null;
  source_count: number | null;
  lat: number;
  lng: number;
};

export async function radarInfo() {
  const { rows } = await db.execute<{ total: number; release: string | null; loaded_at: string | null }>(
    sql`select count(*)::int as total, max(release) as release, max(loaded_at) as loaded_at from ov_places`,
  );
  return rows[0] ?? { total: 0, release: null, loaded_at: null };
}

export async function runSearch(req: SearchRequest): Promise<SearchOutcome> {
  const category = getCategory(req.category);
  if (!category) return { ok: false, error: "Categoria inválida." };
  const radiusM = Math.round(Math.min(Math.max(req.radiusM, 500), 15_000));
  const terms = JSON.stringify(category.overtureTerms);
  const exclude = JSON.stringify(category.overtureExclude ?? []);
  const center = `SRID=4326;POINT(${req.center.lng} ${req.center.lat})`;

  const { rows } = await db.execute<OvRow>(sql`
    with t as (select array_agg(x) as terms from jsonb_array_elements_text(${terms}::jsonb) as x)
    select o.id, o.name, o.brand, o.confidence::text as confidence, o.websites, o.socials, o.emails, o.phones,
           o.address, o.locality, o.source_count,
           ST_Y(o.geom::geometry) as lat, ST_X(o.geom::geometry) as lng
    from ov_places o, t
    where ST_DWithin(o.geom, ${center}::geography, ${radiusM})
      and (o.basic_category = any(t.terms) or o.taxonomy_primary = any(t.terms) or o.hierarchy && t.terms)
      and coalesce(o.basic_category, '') not in (select jsonb_array_elements_text(${exclude}::jsonb))
      and not exists (select 1 from optouts x where x.overture_id = o.id)
    order by o.geom <-> ${center}::geography
    limit ${MAX_RESULTS}`);

  const discarded = { foraDoRaio: 0, fechado: 0, franquia: 0, duplicado: 0 };
  const kept: OvRow[] = [];
  for (const r of rows) {
    const name = r.name ?? "";
    if (!name) continue;
    if (r.brand || isFranchise(name)) {
      discarded.franquia++;
      continue;
    }
    const loc = { lat: Number(r.lat), lng: Number(r.lng) };
    const dup = kept.find((k) => distanceM({ lat: Number(k.lat), lng: Number(k.lng) }, loc) < 60 && nameSimilarity(k.name ?? "", name) >= 0.85);
    if (dup) {
      discarded.duplicado++;
      continue;
    }
    kept.push(r);
  }

  const searchId = await saveResults(req, category, radiusM, kept, rows.length >= MAX_RESULTS);
  return { ok: true, searchId, found: rows.length, kept: kept.length, calls: 0, partial: rows.length >= MAX_RESULTS, discarded };
}

async function saveResults(req: SearchRequest, category: Category, radiusM: number, kept: OvRow[], partial: boolean): Promise<string> {
  const { rows } = await db.execute<{ id: string }>(sql`
    insert into searches (category, center, radius_m, label, status, api_calls, results)
    values (${category.id}, ${`SRID=4326;POINT(${req.center.lng} ${req.center.lat})`}::geography, ${radiusM},
            ${req.label ?? null}, ${partial ? "partial" : "done"}, 0, ${kept.length})
    returning id`);
  const searchId = rows[0].id;
  if (kept.length === 0) return searchId;

  const rowsJson = kept.map((r) => ({
    overture_id: r.id,
    name: r.name,
    category: category.id,
    address: r.address,
    neighborhood: neighborhoodFrom(r.address),
    city: r.locality,
    lng: Number(r.lng),
    lat: Number(r.lat),
    website: r.websites?.[0] ?? null,
    phone: parseBrPhone(r.phones?.[0])?.e164 ?? r.phones?.[0] ?? null,
    confidence: r.confidence == null ? null : Number(r.confidence),
    source_count: r.source_count,
  }));

  // tudo em lote: lugares, ligação com a busca, contatos e fila de análise
  const { rows: upserted } = await db.execute<{ id: string; overture_id: string }>(sql`
    insert into places (source, overture_id, name, category, address, neighborhood, city, geom, website, phone, confidence, source_count, business_status)
    select 'overture', r.overture_id, r.name, r.category, r.address, r.neighborhood, r.city,
           ST_SetSRID(ST_MakePoint(r.lng, r.lat), 4326)::geography, r.website, r.phone, r.confidence, r.source_count, 'OPERATIONAL'
    from jsonb_to_recordset(${JSON.stringify(rowsJson)}::jsonb) as r(
      overture_id text, name text, category text, address text, neighborhood text, city text,
      lng float8, lat float8, website text, phone text, confidence numeric, source_count int)
    on conflict (overture_id) do update set
      name = excluded.name, category = coalesce(places.category, excluded.category), address = excluded.address,
      neighborhood = excluded.neighborhood, city = excluded.city, geom = excluded.geom, website = excluded.website,
      phone = excluded.phone, confidence = excluded.confidence, source_count = excluded.source_count
    returning id, overture_id`);

  const ids = upserted.map((r) => r.id);
  const idsJson = JSON.stringify(ids);
  await db.execute(sql`
    insert into search_results (search_id, place_id)
    select ${searchId}::uuid, x::uuid from jsonb_array_elements_text(${idsJson}::jsonb) as x
    on conflict do nothing`);

  // contatos publicados nas fontes abertas (podem ser guardados)
  const byOv = new Map(kept.map((r) => [r.id, r]));
  const contacts: { place_id: string; kind: string; value: string }[] = [];
  for (const u of upserted) {
    const r = byOv.get(u.overture_id);
    if (!r) continue;
    for (const raw of r.phones ?? []) {
      const p = parseBrPhone(raw);
      if (p) contacts.push({ place_id: u.id, kind: "phone", value: p.e164 });
    }
    for (const e of r.emails ?? []) contacts.push({ place_id: u.id, kind: "email", value: e.toLowerCase() });
    for (const s of r.socials ?? []) {
      if (/instagram\.com/i.test(s)) contacts.push({ place_id: u.id, kind: "instagram", value: s.split("?")[0] });
      else if (/facebook\.com|fb\.com/i.test(s)) contacts.push({ place_id: u.id, kind: "facebook", value: s.split("?")[0] });
    }
  }
  if (contacts.length) {
    await db.execute(sql`
      insert into place_contacts (place_id, kind, value, source, confirmed)
      select r.place_id::uuid, r.kind, r.value, 'overture', false
      from jsonb_to_recordset(${JSON.stringify(contacts)}::jsonb) as r(place_id text, kind text, value text)
      on conflict (place_id, kind, value) do nothing`);
  }

  // nova análise se nunca analisado, se deu erro ou se a última tem mais de 30 dias
  await db.execute(sql`
    insert into site_audits (place_id, url, status)
    select p.id, p.website, 'pending' from places p
    where p.id in (select x::uuid from jsonb_array_elements_text(${idsJson}::jsonb) as x)
    on conflict (place_id) do update set status = 'pending', url = excluded.url, error = null
    where site_audits.audited_at < now() - interval '30 days' or site_audits.status = 'error'`);
  return searchId;
}
