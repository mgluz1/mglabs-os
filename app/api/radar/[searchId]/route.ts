import { connection } from "next/server";

import { NoAccessError, requireCtx } from "@/lib/services/ctx";
import { searchResults } from "@/lib/queries";

// Polling da tela do radar: resultados + quantos ainda estão em análise.
export async function GET(_req: Request, route: RouteContext<"/api/radar/[searchId]">) {
  await connection();
  let ctx: Awaited<ReturnType<typeof requireCtx>>;
  try {
    ctx = await requireCtx();
  } catch (e) {
    if (e instanceof NoAccessError) return Response.json({ error: e.message }, { status: 401 });
    throw e;
  }
  const { searchId } = await route.params;
  if (!/^[0-9a-f-]{36}$/i.test(searchId)) return Response.json({ error: "id inválido" }, { status: 400 });
  return Response.json(await searchResults(searchId, ctx.workspaceId));
}
