import "server-only";

import { gunzipSync } from "node:zlib";

import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { assertAdmin, assertModule, assertWrite, audit, type Ctx } from "@/lib/services/ctx";

// Importa o arquivo publicado pela GitHub Action "overture-ingest" na branch data-overture.
const DEFAULT_URL = "https://raw.githubusercontent.com/mgluz1/radarMGLABS/data-overture/ov_places.jsonl.gz";
const BATCH = 1000;
export const OVERTURE_MIN_ROWS = 100;
export const OVERTURE_MIN_COVERAGE_RATIO = 0.5;

export type OvJson = {
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

export type ParseResult = { ok: true; release: string; rows: OvJson[] } | { ok: false; error: string };

/** Faz o parse e valida a integridade do JSONL antes de tocar no banco. */
export function parseOvertureJsonl(text: string, minRows = OVERTURE_MIN_ROWS): ParseResult {
  const byId = new Map<string, OvJson>();
  let lineNo = 0;
  for (const rawLine of text.split("\n")) {
    lineNo++;
    const line = rawLine.trim();
    if (!line) continue;
    let r: OvJson;
    try {
      r = JSON.parse(line) as OvJson;
    } catch {
      return { ok: false, error: `Arquivo Overture corrompido ou truncado na linha ${lineNo}; importação cancelada.` };
    }
    if (!r || typeof r.id !== "string" || !r.id.trim() || !Number.isFinite(r.lat) || !Number.isFinite(r.lng)) {
      continue;
    }
    if (typeof r.release !== "string" || !r.release.trim()) {
      return { ok: false, error: `Registro sem release válida na linha ${lineNo}; importação cancelada.` };
    }
    byId.set(r.id, { ...r, release: r.release.trim() });
  }

  const rows = [...byId.values()];
  if (rows.length < minRows) {
    return { ok: false, error: `Arquivo com poucos lugares (${rows.length}, mínimo ${minRows}); importação cancelada.` };
  }
  const release = rows[0].release;
  if (rows.some((r) => r.release !== release)) {
    return { ok: false, error: "Arquivo contém múltiplas releases misturadas; importação cancelada." };
  }
  return { ok: true, release, rows };
}

export type ImportOptions = {
  minRows?: number;
  minCoverageRatio?: number;
  fetchImpl?: typeof fetch;
};

export async function importOverture(
  url = process.env.OVERTURE_DATA_URL || DEFAULT_URL,
  opts: ImportOptions = {},
): Promise<ImportResult> {
  const t0 = Date.now();
  const minRows = opts.minRows ?? OVERTURE_MIN_ROWS;
  const minCoverageRatio = opts.minCoverageRatio ?? OVERTURE_MIN_COVERAGE_RATIO;
  const fetchFn = opts.fetchImpl ?? fetch;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { ok: false, error: "URL da base Overture inválida." };
  }
  if (parsedUrl.protocol !== "https:") {
    return { ok: false, error: "URL da base Overture deve usar HTTPS." };
  }

  const res = await fetchFn(parsedUrl.toString(), { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return { ok: false, error: `Download falhou: HTTP ${res.status}` };

  let text: string;
  try {
    text = gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf-8");
  } catch {
    return { ok: false, error: "Falha ao descompactar o arquivo Overture; importação cancelada." };
  }

  const parsed = parseOvertureJsonl(text, minRows);
  if (!parsed.ok) return parsed;
  const { rows, release } = parsed;

  return db.transaction(async (tx) => {
    const { rows: curCountRows } = await tx.execute<{ n: number }>(sql`select count(*)::int as n from ov_places`);
    const existingCount = curCountRows[0]?.n ?? 0;
    const minRequiredByCoverage = Math.ceil(existingCount * minCoverageRatio);
    if (existingCount >= minRows && rows.length < minRequiredByCoverage) {
      return {
        ok: false as const,
        error: `Carga possivelmente incompleta (${rows.length} lugares vs ${existingCount} atuais; mínimo ${minRequiredByCoverage}); importação cancelada.`,
      };
    }

    await tx.execute(sql`create temp table ov_places_stage (like ov_places) on commit drop`);

    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = JSON.stringify(rows.slice(i, i + BATCH));
      await tx.execute(sql`
        insert into ov_places_stage (id, name, basic_category, taxonomy_primary, hierarchy, alternates, brand, confidence,
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
          address text, locality text, postcode text, source_count int, lng float8, lat float8, release text)`);
    }

    const { rows: stageCountRows } = await tx.execute<{ n: number }>(sql`select count(*)::int as n from ov_places_stage`);
    const stagedCount = stageCountRows[0]?.n ?? 0;
    if (stagedCount < minRows || stagedCount !== rows.length || (existingCount >= minRows && stagedCount < minRequiredByCoverage)) {
      throw new Error(`Validação de staging falhou (${stagedCount}/${rows.length}); transação revertida.`);
    }

    await tx.execute(sql`
      insert into ov_places (id, name, basic_category, taxonomy_primary, hierarchy, alternates, brand, confidence,
                             operating_status, websites, socials, emails, phones, address, locality, postcode,
                             source_count, geom, release, loaded_at)
      select id, name, basic_category, taxonomy_primary, hierarchy, alternates, brand, confidence,
             operating_status, websites, socials, emails, phones, address, locality, postcode,
             source_count, geom, release, loaded_at
      from ov_places_stage
      on conflict (id) do update set
        name = excluded.name, basic_category = excluded.basic_category, taxonomy_primary = excluded.taxonomy_primary,
        hierarchy = excluded.hierarchy, alternates = excluded.alternates, brand = excluded.brand,
        confidence = excluded.confidence, operating_status = excluded.operating_status, websites = excluded.websites,
        socials = excluded.socials, emails = excluded.emails, phones = excluded.phones, address = excluded.address,
        locality = excluded.locality, postcode = excluded.postcode, source_count = excluded.source_count,
        geom = excluded.geom, release = excluded.release, loaded_at = excluded.loaded_at`);

    // Só depois da carga completa em staging e validação de cobertura: remove o que sumiu da release.
    const { rows: del } = await tx.execute<{ n: number }>(sql`
      with d as (
        delete from ov_places o
        where not exists (select 1 from ov_places_stage s where s.id = o.id)
        returning 1
      )
      select count(*)::int as n from d`);

    return { ok: true as const, release, rows: stagedCount, removed: del[0]?.n ?? 0, ms: Date.now() - t0 };
  });
}

export async function importOvertureAsAdmin(ctx: Ctx, url?: string, opts?: ImportOptions): Promise<ImportResult> {
  assertWrite(ctx);
  assertModule(ctx, "config");
  assertAdmin(ctx, "Só administradores podem atualizar a base aberta.");
  const res = await importOverture(url, opts);
  if (res.ok) await audit(ctx, "import", "ov_places", res.release, { rows: res.rows, removed: res.removed });
  return res;
}
