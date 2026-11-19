import { connection } from "next/server";

import { countAvailablePlaces } from "@/lib/places/search";
import { assertModule, ForbiddenError, NoAccessError, requireCtx } from "@/lib/services/ctx";

export async function GET(req: Request) {
  await connection();
  try {
    const ctx = await requireCtx();
    assertModule(ctx, "comercial");
  } catch (e) {
    if (e instanceof NoAccessError) return Response.json({ error: e.message }, { status: 401 });
    if (e instanceof ForbiddenError) return Response.json({ error: e.message }, { status: 403 });
    throw e;
  }

  const sp = new URL(req.url).searchParams;
  const category = sp.get("category") ?? "barbearia";
  const query = sp.get("q") ?? undefined;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  const radiusM = Number(sp.get("radiusM"));
  if (![lat, lng, radiusM].every(Number.isFinite)) {
    return Response.json({ error: "Parâmetros espaciais inválidos." }, { status: 400 });
  }

  return Response.json(await countAvailablePlaces({ category, query, center: { lat, lng }, radiusM }));
}
