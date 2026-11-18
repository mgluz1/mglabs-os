import { connection } from "next/server";

import { requireUser, UnauthorizedError } from "@/lib/auth/require";
import { estimateSearch } from "@/lib/places/search";

// Estimativa de chamadas para um raio + uso do mês (mostrado antes de buscar).
export async function GET(req: Request) {
  await connection();
  try {
    await requireUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return Response.json({ error: e.message }, { status: 401 });
    throw e;
  }
  const radius = Number(new URL(req.url).searchParams.get("radius") ?? 3000);
  return Response.json(await estimateSearch(Number.isFinite(radius) ? radius : 3000));
}
