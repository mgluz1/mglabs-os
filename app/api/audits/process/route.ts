import { connection } from "next/server";

import { processAuditBatch } from "@/lib/audit/process";
import { NoAccessError, requireCtx } from "@/lib/services/ctx";

export const maxDuration = 60;

// Processa um lote da fila de análise (chamado pelo polling da tela enquanto houver pendentes).
export async function POST() {
  await connection();
  try {
    await requireCtx();
  } catch (e) {
    if (e instanceof NoAccessError) return Response.json({ error: e.message }, { status: 401 });
    throw e;
  }
  return Response.json(await processAuditBatch(5));
}
