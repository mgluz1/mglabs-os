import { connection } from "next/server";

import { requireUser, UnauthorizedError } from "@/lib/auth/require";
import { radarInfo } from "@/lib/places/search";

// Quantos lugares a base aberta tem e de qual release do Overture (mostrado antes de buscar).
export async function GET() {
  await connection();
  try {
    await requireUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return Response.json({ error: e.message }, { status: 401 });
    throw e;
  }
  return Response.json(await radarInfo());
}
