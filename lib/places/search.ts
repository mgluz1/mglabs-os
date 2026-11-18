import "server-only";

import { sql } from "drizzle-orm";

import { getCategory, type Category } from "@/lib/config/categories";
import { db } from "@/lib/db";
import { distanceM, gridCover, subdivide, type Circle, type LatLng } from "@/lib/geo";
import { PlacesApiError, pickComponent, searchNearby, type GooglePlace } from "@/lib/places/google";
import { monthlyCap, placesUsageThisMonth, reserveCalls } from "@/lib/quota";
import { isFranchise, nameSimilarity } from "@/lib/text";

const CELL_RADIUS_M = 1500;
const MAX_DEPTH = 3;
const CACHE_DAYS = 30;

export type SearchRequest = { category: string; center: LatLng; radiusM: number; label?: string };

export type SearchOutcome =
  | { ok: true; searchId: string; found: number; kept: number; calls: number; partial: boolean; discarded: Record<string, number> }
  | { ok: false; error: string; estimate?: number; remaining?: number };

export async function estimateSearch(radiusM: number) {
  const cells = gridCover({ lat: 0, lng: 0 }, radiusM, CELL_RADIUS_M).length;
  const used = await placesUsageThisMonth();
  const cap = monthlyCap();
  return { cells, used, cap, remaining: Math.max(0, cap - used) };
}

export async function runSearch(req: SearchRequest): Promise<SearchOutcome> {
  const category = getCategory(req.category);
  if (!category) return { ok: false, error: "Categoria inválida." };
  const radiusM = Math.round(Math.min(Math.max(req.radiusM, 500), 15_000));

  const cells = gridCover(req.center, radiusM, CELL_RADIUS_M);
  const used = await placesUsageThisMonth();
  const cap = monthlyCap();
  if (used + cells.length > cap) {
    return {
      ok: false,
      error: `Esta busca usaria pelo menos ${cells.length} chamadas e restam ${Math.max(0, cap - used)} no mês (limite ${cap}). Diminua o raio.`,
      estimate: cells.length,
      remaining: Math.max(0, cap - used),
    };
  }

  // 1) varre a grade, subdividindo células saturadas (20 resultados)
  const byId = new Map<string, GooglePlace>();
  let calls = 0;
  let partial = false;
  let types = category.types;
  const queue: { c: Circle; depth: number }[] = cells.map((c) => ({ c, depth: 0 }));

  while (queue.length) {
    const { c, depth } = queue.shift()!;
    if (!(await reserveCalls("places:searchNearby"))) {
      partial = true;
      break;
    }
    calls++;
    let results: GooglePlace[];
    try {
      results = await searchNearby(c, types);
    } catch (e) {
      if (e instanceof PlacesApiError && e.isInvalidType && types !== category.coreTypes) {
        types = category.coreTypes; // algum tipo novo foi recusado: refaz só com os básicos
        queue.unshift({ c, depth });
        continue;
      }
      throw e;
    }
    for (const p of results) byId.set(p.id, p);
    if (results.length >= 20 && depth < MAX_DEPTH) {
      for (const k of subdivide(c)) queue.push({ c: k, depth: depth + 1 });
    }
  }

  // 2) limpa: fora do raio, fechados, franquias, duplicatas por nome+distância
  const discarded = { foraDoRaio: 0, fechado: 0, franquia: 0, duplicado: 0 };
  const kept: GooglePlace[] = [];
  for (const p of byId.values()) {
    const name = p.displayName?.text ?? "";
    const loc = p.location ? { lat: p.location.latitude, lng: p.location.longitude } : null;
    if (!loc || distanceM(req.center, loc) > radiusM) {
      discarded.foraDoRaio++;
      continue;
    }
    if (p.businessStatus && p.businessStatus !== "OPERATIONAL") {
      discarded.fechado++;
      continue;
    }
    if (isFranchise(name)) {
      discarded.franquia++;
      continue;
    }
    const dup = kept.find((k) => {
      const kl = { lat: k.location!.latitude, lng: k.location!.longitude };
      return distanceM(kl, loc) < 50 && nameSimilarity(k.displayName?.text ?? "", name) >= 0.85;
    });
    if (dup) {
      discarded.duplicado++;
      continue;
    }
    kept.push(p);
  }

  // 3) grava busca, lugares (cache Google com validade) e fila de análise
  const searchId = await saveResults(req, category, radiusM, kept, calls, partial);
  return { ok: true, searchId, found: byId.size, kept: kept.length, calls, partial, discarded };
}

async function saveResults(
  req: SearchRequest,
  category: Category,
  radiusM: number,
  kept: GooglePlace[],
  calls: number,
  partial: boolean,
): Promise<string> {
  const { rows } = await db.execute<{ id: string }>(sql`
    insert into searches (category, center, radius_m, label, status, api_calls, results)
    values (${category.id}, ${`SRID=4326;POINT(${req.center.lng} ${req.center.lat})`}::geography, ${radiusM},
            ${req.label ?? null}, ${partial ? "partial" : "done"}, ${calls}, ${kept.length})
    returning id`);
  const searchId = rows[0].id;

  // exclui quem pediu para não ser contatado
  const optedOut = new Set(
    (await db.execute<{ google_place_id: string }>(sql`select google_place_id from optouts where google_place_id is not null`)).rows.map(
      (r) => r.google_place_id,
    ),
  );

  const rowsJson = kept
    .filter((p) => !optedOut.has(p.id))
    .map((p) => ({
      google_place_id: p.id,
      name: p.displayName?.text ?? null,
      primary_type: p.primaryType ?? null,
      category: category.id,
      address: p.shortFormattedAddress ?? p.formattedAddress ?? null,
      neighborhood: pickComponent(p, "sublocality_level_1", "sublocality", "neighborhood"),
      city: pickComponent(p, "administrative_area_level_2", "locality"),
      lng: p.location!.longitude,
      lat: p.location!.latitude,
      rating: p.rating ?? null,
      rating_count: p.userRatingCount ?? null,
      business_status: p.businessStatus ?? null,
      google_phone: p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null,
      google_website: p.websiteUri ?? null,
      google_maps_uri: p.googleMapsUri ?? null,
    }));
  if (rowsJson.length === 0) return searchId;

  // tudo em lote: 3 consultas, qualquer que seja o número de lugares
  const { rows: upserted } = await db.execute<{ id: string; google_website: string | null }>(sql`
    insert into places (google_place_id, name, primary_type, category, address, neighborhood, city, geom,
                        rating, rating_count, business_status, google_phone, google_website, google_maps_uri, google_cached_until)
    select r.google_place_id, r.name, r.primary_type, r.category, r.address, r.neighborhood, r.city,
           ST_SetSRID(ST_MakePoint(r.lng, r.lat), 4326)::geography,
           r.rating, r.rating_count, r.business_status, r.google_phone, r.google_website, r.google_maps_uri,
           now() + make_interval(days => ${CACHE_DAYS})
    from jsonb_to_recordset(${JSON.stringify(rowsJson)}::jsonb) as r(
      google_place_id text, name text, primary_type text, category text, address text, neighborhood text, city text,
      lng float8, lat float8, rating numeric, rating_count int, business_status text,
      google_phone text, google_website text, google_maps_uri text)
    on conflict (google_place_id) do update set
      name = excluded.name, primary_type = excluded.primary_type,
      category = coalesce(places.category, excluded.category),
      address = excluded.address, neighborhood = excluded.neighborhood, city = excluded.city, geom = excluded.geom,
      rating = excluded.rating, rating_count = excluded.rating_count, business_status = excluded.business_status,
      google_phone = excluded.google_phone, google_website = excluded.google_website,
      google_maps_uri = excluded.google_maps_uri, google_cached_until = excluded.google_cached_until
    returning id, google_website`);

  const ids = upserted.map((r) => r.id);
  await db.execute(sql`
    insert into search_results (search_id, place_id)
    select ${searchId}::uuid, x::uuid from jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb) as x
    on conflict do nothing`);

  // nova análise se nunca analisado, se deu erro ou se a última tem mais de 30 dias
  await db.execute(sql`
    insert into site_audits (place_id, url, status)
    select p.id, p.google_website, 'pending' from places p where p.id in (select x::uuid from jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb) as x)
    on conflict (place_id) do update set status = 'pending', url = excluded.url, error = null
    where site_audits.audited_at < now() - interval '30 days' or site_audits.status = 'error'`);
  return searchId;
}
