import "server-only";

import { sql, type SQL } from "drizzle-orm";

import { getCategory, type Category } from "@/lib/config/categories";
import { db } from "@/lib/db";
import { distanceM, type LatLng } from "@/lib/geo";
import { parseBrPhone } from "@/lib/phone";
import { isFranchise, nameSimilarity, neighborhoodFrom } from "@/lib/text";

// Busca na base aberta do Overture Maps (tabela ov_places, carregada pela GitHub Action).
// Sem custo por busca e sem restrição de mapa: os dados podem ser guardados e mostrados no OpenStreetMap.

export const MIN_SEARCH_LIMIT = 5;
export const MAX_RESULTS = 600;

export type SearchRequest = {
  category: string;
  query?: string;
  center: LatLng;
  radiusM: number;
  limit?: number;
  label?: string;
};

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

function sanitizeSearchTerm(raw?: string | null): string {
  return (raw ?? "").trim().slice(0, 60);
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

type ResolvedFilter =
  | { ok: true; storedCategory: string; agenda: boolean; categoryId: string; filterSql: SQL }
  | { ok: false; error: string };

function resolveOvertureFilter(categoryRaw: string, queryRaw?: string): ResolvedFilter {
  const custom = sanitizeSearchTerm(queryRaw);
  const storedCustom = categoryRaw.startsWith("q:") ? sanitizeSearchTerm(categoryRaw.slice(2)) : "";
  const term = categoryRaw === "personalizado" ? custom : storedCustom;

  if (term) {
    if (term.length < 2) return { ok: false, error: "Digite pelo menos 2 letras para buscar um segmento." };
    const like = `%${escapeLike(term)}%`;
    return {
      ok: true,
      storedCategory: `q:${term}`,
      categoryId: `q:${term}`,
      agenda: false,
      filterSql: sql`(
        o.name ilike ${like} escape '\'
        or coalesce(o.basic_category, '') ilike ${like} escape '\'
        or coalesce(o.taxonomy_primary, '') ilike ${like} escape '\'
        or array_to_string(coalesce(o.hierarchy, '{}'::text[]), ' ') ilike ${like} escape '\'
      )`,
    };
  }

  const category = getCategory(categoryRaw);
  if (!category) return { ok: false, error: "Categoria inválida." };
  const terms = JSON.stringify(category.overtureTerms);
  const exclude = JSON.stringify(category.overtureExclude ?? []);
  const kwRegex = category.nameKeywords?.length ? category.nameKeywords.join("|") : null;

  return {
    ok: true,
    storedCategory: category.id,
    categoryId: category.id,
    agenda: category.agenda,
    filterSql: sql`
      (
        o.basic_category = any(array(select jsonb_array_elements_text(${terms}::jsonb)))
        or o.taxonomy_primary = any(array(select jsonb_array_elements_text(${terms}::jsonb)))
        or o.hierarchy && array(select jsonb_array_elements_text(${terms}::jsonb))
      )
      and coalesce(o.basic_category, '') not in (select jsonb_array_elements_text(${exclude}::jsonb))
      ${kwRegex ? sql`and (coalesce(o.name, '') ~* ${kwRegex} or coalesce(o.basic_category, '') ~* ${kwRegex} or coalesce(o.taxonomy_primary, '') ~* ${kwRegex})` : sql``}
    `,
  };
}

export async function radarInfo() {
  const { rows } = await db.execute<{ total: number; release: string | null; loaded_at: string | null }>(
    sql`select count(*)::int as total, max(release) as release, max(loaded_at) as loaded_at from ov_places`,
  );
  return rows[0] ?? { total: 0, release: null, loaded_at: null };
}

/** Conta quantos negócios reais da base atendem ao filtro espacial + segmento antes de disparar a busca. */
export async function countAvailablePlaces(req: { category: string; query?: string; center: LatLng; radiusM: number }) {
  const resolved = resolveOvertureFilter(req.category, req.query);
  if (!resolved.ok) return { available: 0, maxLimit: MIN_SEARCH_LIMIT, cappedAt: MAX_RESULTS };
  const radiusM = Math.round(Math.min(Math.max(req.radiusM, 500), 15_000));
  const center = `SRID=4326;POINT(${req.center.lng} ${req.center.lat})`;
  const { rows } = await db.execute<{ total: number }>(sql`
    select count(*)::int as total
    from ov_places o
    where ST_DWithin(o.geom, ${center}::geography, ${radiusM})
      and o.name is not null
      and coalesce(o.brand, '') = ''
      and ${resolved.filterSql}
      and not exists (select 1 from optouts x where x.overture_id = o.id)
  `);
  const available = rows[0]?.total ?? 0;
  return { available, maxLimit: Math.max(MIN_SEARCH_LIMIT, Math.min(MAX_RESULTS, available)), cappedAt: MAX_RESULTS };
}

export async function runSearch(req: SearchRequest): Promise<SearchOutcome> {
  const resolved = resolveOvertureFilter(req.category, req.query);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const radiusM = Math.round(Math.min(Math.max(req.radiusM, 500), 15_000));
  const limit = Math.round(Math.min(Math.max(req.limit ?? MAX_RESULTS, MIN_SEARCH_LIMIT), MAX_RESULTS));
  const center = `SRID=4326;POINT(${req.center.lng} ${req.center.lat})`;

  const { rows: rawRows } = await db.execute<OvRow>(sql`
    select o.id, o.name, o.brand, o.confidence::text as confidence, o.websites, o.socials, o.emails, o.phones,
           o.address, o.locality, o.source_count,
           ST_Y(o.geom::geometry) as lat, ST_X(o.geom::geometry) as lng
    from ov_places o
    where ST_DWithin(o.geom, ${center}::geography, ${radiusM})
      and ${resolved.filterSql}
      and not exists (select 1 from optouts x where x.overture_id = o.id)
    order by o.geom <-> ${center}::geography
    limit ${limit + 1}`);

  const hasMore = rawRows.length > limit;
  const rows = rawRows.slice(0, limit);

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

  const searchId = await saveResults(req, resolved.storedCategory, radiusM, kept, hasMore);
  return { ok: true, searchId, found: rows.length, kept: kept.length, calls: 0, partial: hasMore, discarded };
}

async function upsertSearchPlaces(searchId: string, categoryId: Category["id"] | string, kept: OvRow[]) {
  if (kept.length === 0) return;

  const rowsJson = kept.map((r) => ({
    overture_id: r.id,
    name: r.name,
    category: categoryId,
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
}

async function saveResults(req: SearchRequest, categoryId: string, radiusM: number, kept: OvRow[], partial: boolean): Promise<string> {
  const { rows } = await db.execute<{ id: string }>(sql`
    insert into searches (category, center, radius_m, label, status, api_calls, results)
    values (${categoryId}, ${`SRID=4326;POINT(${req.center.lng} ${req.center.lat})`}::geography, ${radiusM},
            ${req.label ?? null}, ${partial ? "partial" : "done"}, 0, ${kept.length})
    returning id`);
  const searchId = rows[0].id;
  await upsertSearchPlaces(searchId, categoryId, kept);
  return searchId;
}

/** Carrega o próximo lote (até 600) de uma busca parcial, deduplicando contra o que já foi retornado. */
export async function loadMoreSearchResults(searchId: string): Promise<{ ok: true; added: number; hasMore: boolean } | { ok: false; error: string }> {
  const { rows: searchRows } = await db.execute<{ category: string; radius_m: number; status: string; lat: number; lng: number }>(sql`
    select category, radius_m, status, ST_Y(center::geometry) as lat, ST_X(center::geometry) as lng
    from searches where id = ${searchId}`);
  const s = searchRows[0];
  if (!s) return { ok: false, error: "Busca não encontrada." };
  const resolved = resolveOvertureFilter(s.category);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  if (s.status !== "partial") return { ok: true, added: 0, hasMore: false };

  const center = `SRID=4326;POINT(${Number(s.lng)} ${Number(s.lat)})`;
  const batchLimit = MAX_RESULTS;

  const [{ rows: existing }, { rows: rawRows }] = await Promise.all([
    db.execute<{ name: string | null; lat: number; lng: number }>(sql`
      select p.name, ST_Y(p.geom::geometry) as lat, ST_X(p.geom::geometry) as lng
      from search_results sr join places p on p.id = sr.place_id
      where sr.search_id = ${searchId}`),
    db.execute<OvRow>(sql`
      select o.id, o.name, o.brand, o.confidence::text as confidence, o.websites, o.socials, o.emails, o.phones,
             o.address, o.locality, o.source_count,
             ST_Y(o.geom::geometry) as lat, ST_X(o.geom::geometry) as lng
      from ov_places o
      where ST_DWithin(o.geom, ${center}::geography, ${s.radius_m})
        and ${resolved.filterSql}
        and not exists (select 1 from optouts x where x.overture_id = o.id)
        and not exists (
          select 1 from search_results sr join places p on p.id = sr.place_id
          where sr.search_id = ${searchId} and p.overture_id = o.id
        )
      order by o.geom <-> ${center}::geography, o.id
      limit ${batchLimit + 1}`),
  ]);

  const hasMore = rawRows.length > batchLimit;
  const rows = rawRows.slice(0, batchLimit);

  const kept: OvRow[] = [];
  const poolCoords = existing.map((e) => ({ name: e.name ?? "", lat: Number(e.lat), lng: Number(e.lng) }));
  for (const r of rows) {
    const name = r.name ?? "";
    if (!name || r.brand || isFranchise(name)) continue;
    const loc = { lat: Number(r.lat), lng: Number(r.lng) };
    const dup = poolCoords.find((k) => distanceM({ lat: k.lat, lng: k.lng }, loc) < 60 && nameSimilarity(k.name, name) >= 0.85);
    if (dup) continue;
    kept.push(r);
    poolCoords.push({ name, lat: loc.lat, lng: loc.lng });
  }

  await upsertSearchPlaces(searchId, resolved.storedCategory, kept);
  await db.execute(sql`
    update searches
    set status = ${hasMore ? "partial" : "done"},
        results = (select count(*)::int from search_results where search_id = ${searchId})
    where id = ${searchId}`);
  return { ok: true, added: kept.length, hasMore };
}
