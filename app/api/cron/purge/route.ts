import { sql } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/lib/db";

// Cron diário: apaga campos do Google vencidos há mais de 30 dias de lugares fora do CRM.
// Mantém place_id (permitido guardar), contatos do site da empresa e dados próprios.
export async function GET(req: Request) {
  await connection();
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Não autorizado" }, { status: 401 });
  }
  const { rows } = await db.execute<{ n: number }>(sql`
    with purged as (
      update places set name = null, address = null, rating = null, rating_count = null, business_status = null,
        google_phone = null, google_website = null, google_maps_uri = null, primary_type = null, geom = null
      where google_cached_until < now() - interval '30 days'
        and name is not null
        and id not in (select place_id from leads where place_id is not null)
      returning 1
    ) select count(*)::int as n from purged`);
  return Response.json({ purged: rows[0]?.n ?? 0 });
}
