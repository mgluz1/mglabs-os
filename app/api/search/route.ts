import { connection } from "next/server";

import { NoAccessError, requireCtx } from "@/lib/services/ctx";
import { globalSearch } from "@/lib/services/search";

export async function GET(req: Request) {
  await connection();
  try {
    const ctx = await requireCtx();
    const q = new URL(req.url).searchParams.get("q") ?? "";
    return Response.json({ hits: await globalSearch(ctx, q.slice(0, 80)) });
  } catch (e) {
    if (e instanceof NoAccessError) return Response.json({ error: e.message }, { status: 401 });
    console.error("search", e instanceof Error ? e.message : e);
    return Response.json({ error: "Falha na busca" }, { status: 500 });
  }
}
