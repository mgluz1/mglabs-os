import { connection } from "next/server";

import { requireUser, UnauthorizedError } from "@/lib/auth/require";
import { searchResults } from "@/lib/queries";

// Polling da tela do radar: resultados + quantos ainda estão em análise.
export async function GET(_req: Request, ctx: RouteContext<"/api/radar/[searchId]">) {
  await connection();
  try {
    await requireUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return Response.json({ error: e.message }, { status: 401 });
    throw e;
  }
  const { searchId } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(searchId)) return Response.json({ error: "id inválido" }, { status: 400 });
  return Response.json(await searchResults(searchId));
}
