import "server-only";

import { pool } from "@/lib/db";

export type DbHealth =
  | { ok: true; postgres: string; postgis: string | null; pgTrgm: boolean; tables: number; ms: number }
  | { ok: false; error: string; ms: number };

export async function checkDatabase(): Promise<DbHealth> {
  const started = Date.now();
  try {
    const { rows } = await pool.query<{
      postgres: string;
      postgis: string | null;
      pg_trgm: boolean;
      tables: number;
    }>(`
      select
        current_setting('server_version') as postgres,
        (select extversion from pg_extension where extname = 'postgis') as postgis,
        exists(select 1 from pg_extension where extname = 'pg_trgm') as pg_trgm,
        (select count(*)::int from information_schema.tables
          where table_schema = 'public'
            and table_name in ('places','place_contacts','site_audits','lead_scores',
                               'searches','leads','activities','optouts','api_usage','workspaces','crm_companies','crm_deals','crm_stages')) as tables
    `);
    const r = rows[0];
    return { ok: true, postgres: r.postgres, postgis: r.postgis, pgTrgm: r.pg_trgm, tables: r.tables, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), ms: Date.now() - started };
  }
}
