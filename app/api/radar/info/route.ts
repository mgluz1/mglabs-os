import { connection } from "next/server";

import { NoAccessError, requireCtx } from "@/lib/services/ctx";
import { radarInfo } from "@/lib/places/search";

// Quantos lugares a base aberta tem e de qual release do Overture (mostrado antes de buscar).
export async function GET() {
  await connection();
  try {
    await requireCtx();
  } catch (e) {
    if (e instanceof NoAccessError) return Response.json({ error: e.message }, { status: 401 });
    throw e;
  }
  return Response.json(await radarInfo());
}
