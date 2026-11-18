import { connection } from "next/server";

import { processAuditBatch } from "@/lib/audit/process";
import { requireUser, UnauthorizedError } from "@/lib/auth/require";

export const maxDuration = 60;

// Processa um lote da fila de análise (chamado pelo polling da tela enquanto houver pendentes).
export async function POST() {
  await connection();
  try {
    await requireUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return Response.json({ error: e.message }, { status: 401 });
    throw e;
  }
  return Response.json(await processAuditBatch(5));
}
