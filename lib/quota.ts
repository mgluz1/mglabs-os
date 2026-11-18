import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

// Endpoints do Google que contam para a trava PLACES_MONTHLY_CAP (SKU Enterprise).
export const PLACES_ENDPOINTS = ["places:searchNearby", "places:details"] as const;
export type PlacesEndpoint = (typeof PLACES_ENDPOINTS)[number];

export function currentMonth(d = new Date()): string {
  // mês no fuso de Brasília
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(d);
}

export function monthlyCap(): number {
  const n = Number(process.env.PLACES_MONTHLY_CAP ?? 900);
  return Number.isFinite(n) && n > 0 ? n : 900;
}

export async function placesUsageThisMonth(): Promise<number> {
  const { rows } = await db.execute<{ total: number }>(
    sql`select coalesce(sum(calls), 0)::int as total from api_usage
        where month = ${currentMonth()} and endpoint in ('places:searchNearby', 'places:details')`,
  );
  return rows[0]?.total ?? 0;
}

/** Reserva `n` chamadas atomicamente; devolve false se estouraria o teto. */
export async function reserveCalls(endpoint: PlacesEndpoint, n = 1): Promise<boolean> {
  const cap = monthlyCap();
  const month = currentMonth();
  const { rows } = await db.execute<{ ok: boolean }>(sql`
    with used as (
      select coalesce(sum(calls), 0)::int as total from api_usage
      where month = ${month} and endpoint in ('places:searchNearby', 'places:details')
    ), ins as (
      insert into api_usage (month, endpoint, calls)
      select ${month}, ${endpoint}, ${n} from used where used.total + ${n} <= ${cap}
      on conflict (month, endpoint) do update set calls = api_usage.calls + excluded.calls
      returning 1
    )
    select exists(select 1 from ins) as ok`);
  return rows[0]?.ok ?? false;
}

export async function countCall(endpoint: string, n = 1): Promise<void> {
  await db.execute(sql`
    insert into api_usage (month, endpoint, calls) values (${currentMonth()}, ${endpoint}, ${n})
    on conflict (month, endpoint) do update set calls = api_usage.calls + excluded.calls`);
}
