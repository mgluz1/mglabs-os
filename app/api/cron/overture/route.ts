import { connection } from "next/server";

import { importOverture } from "@/lib/overture/import";

export const maxDuration = 60;

// Importa a base aberta (Overture) publicada na branch data-overture.
// Agendado no vercel.json (mensal) e protegido por CRON_SECRET (header Bearer ou ?secret=).
export async function GET(req: Request) {
  await connection();
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? url.searchParams.get("secret");
  if (!secret || given !== secret) return Response.json({ error: "Não autorizado" }, { status: 401 });
  const out = await importOverture();
  return Response.json(out, { status: out.ok ? 200 : 502 });
}
