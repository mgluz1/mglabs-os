import "server-only";

import { gunzipSync } from "node:zlib";

import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

// Importa o arquivo publicado pela GitHub Action "overture-ingest" na branch data-overture.
const DEFAULT_URL = "https://raw.githubusercontent.com/mgluz1/radarMGLABS/data-overture/ov_places.jsonl.gz";
const BATCH = 1000;

type OvJson = {
  id: string;
  name: string | null;
  basic_category: string | null;
  taxonomy_primary: string | null;
  hierarchy: string[] | null;
  alternates: string[] | null;
  brand: string | null;
  confidence: number | null;
  operating_status: string | null;
  websites: string[] | null;
  socials: string[] | null;
  emails: string[] | null;
  phones: string[] | null;
  address: string | null;
  locality: string | null;
  postcode: string | null;
  source_count: number | null;
  lng: number;
  lat: number;
  release: string;
};

export type ImportResult = { ok: true; release: string; rows: number; removed: number; ms: number } | { ok: false; error: string };

export async function importOverture(url = process.env.OVERTURE_DATA_URL || DEFAULT_URL): Promise<ImportResult> {
  const t0 = Date.now();
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return { ok: false, error: `Download falhou: HTTP ${res.status}` };
  const text = gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf-8");
  const rows: OvJson[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line) as OvJson;
    if (r.id && Number.isFinite(r.lat) && Number.isFinite(r.lng)) rows.push(r);
  }
  if (rows.length < 100) return { ok: false, error: `Arquivo com poucos lugares (${rows.length}); importação cancelada.` };
  const release = rows[0].release;

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = JSON.stringify(rows.slice(i, i + BATCH));
    await db.execute(sql`
      insert into ov_places (id, name, basic_category, taxonomy_primary, hierarchy, alternates, brand, confidence,
                             operating_status, websites, socials, emails, phones, address, locality, postcode,
                             source_count, geom, release, loaded_at)
      select r.id, r.name, r.basic_category, r.taxonomy_primary,
             array(select jsonb_array_elements_text(coalesce(r.hierarchy, '[]'))),
             array(select jsonb_array_elements_text(coalesce(r.alternates, '[]'))),
             r.brand, r.confidence, r.operating_status,
             array(select jsonb_array_elements_text(coalesce(r.websites, '[]'))),
             array(select jsonb_array_elements_text(coalesce(r.socials, '[]'))),
             array(select jsonb_array_elements_text(coalesce(r.emails, '[]'))),
             array(select jsonb_array_elements_text(coalesce(r.phones, '[]'))),
             r.address, r.locality, r.postcode, r.source_count,
             ST_SetSRID(ST_MakePoint(r.lng, r.lat), 4326)::geography, r.release, now()
      from jsonb_to_recordset(${chunk}::jsonb) as r(
        id text, name text, basic_category text, taxonomy_primary text, hierarchy jsonb, alternates jsonb, brand text,
        confidence numeric, operating_status text, websites jsonb, socials jsonb, emails jsonb, phones jsonb,
        address text, locality text, postcode text, source_count int, lng float8, lat float8, release text)
      on conflict (id) do update set
        name = excluded.name, basic_category = excluded.basic_category, taxonomy_primary = excluded.taxonomy_primary,
        hierarchy = excluded.hierarchy, alternates = excluded.alternates, brand = excluded.brand,
        confidence = excluded.confidence, operating_status = excluded.operating_status, websites = excluded.websites,
        socials = excluded.socials, emails = excluded.emails, phones = excluded.phones, address = excluded.address,
        locality = excluded.locality, postcode = excluded.postcode, source_count = excluded.source_count,
        geom = excluded.geom, release = excluded.release, loaded_at = now()`);
  }

  // só depois de tudo gravado: tira o que sumiu do Overture (fechou ou foi removido)
  const { rows: del } = await db.execute<{ n: number }>(sql`
    with d as (delete from ov_places where release <> ${release} returning 1) select count(*)::int as n from d`);
  return { ok: true, release, rows: rows.length, removed: del[0]?.n ?? 0, ms: Date.now() - t0 };
}
