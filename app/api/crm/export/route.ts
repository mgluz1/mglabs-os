import { connection } from "next/server";

import { getCategory } from "@/lib/config/categories";
import { sourceLabel } from "@/lib/config/crm";
import { fmtDateTime } from "@/lib/dates";
import { ForbiddenError, NoAccessError, requireCtx } from "@/lib/services/ctx";
import { listDeals } from "@/lib/services/deals";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

function cell(v: unknown): string {
  const s = v == null ? "" : String(v);
  // evita injeção de fórmula ao abrir no Excel/Sheets
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// Exporta as oportunidades do espaço de trabalho (CSV, separador ";", UTF-8 com BOM).
export async function GET() {
  await connection();
  let ctx: Awaited<ReturnType<typeof requireCtx>>;
  try {
    ctx = await requireCtx();
  } catch (e) {
    if (e instanceof NoAccessError) return Response.json({ error: e.message }, { status: 401 });
    throw e;
  }
  let deals: Awaited<ReturnType<typeof listDeals>>;
  try {
    deals = await listDeals(ctx, { limit: 1000 });
  } catch (e) {
    if (e instanceof ForbiddenError) return Response.json({ error: e.message }, { status: 403 });
    throw e;
  }
  const stages = new Map((await db.execute<{ key: string; label: string }>(sql`select key, label from crm_stages where workspace_id = ${ctx.workspaceId}`)).rows.map((r) => [r.key, r.label]));
  const header = ["Oportunidade", "Empresa", "Categoria", "Cidade", "Etapa", "Serviço", "Valor previsto (R$)", "Probabilidade (%)", "Origem", "Próximo passo", "Prazo", "Lead Score", "Motivo da perda", "Contato principal", "Criada em"];
  const lines = deals.map((d) =>
    [d.title, d.companyName, getCategory(d.category ?? "")?.label ?? d.category, d.city, stages.get(d.stageKey) ?? d.stageKey, d.serviceType, d.valueCents == null ? "" : (d.valueCents / 100).toFixed(2).replace(".", ","), d.probability, sourceLabel(d.source), d.nextStep, d.nextStepAt ? fmtDateTime(d.nextStepAt) : "", d.score, d.lostReason, d.contactName, fmtDateTime(d.createdAt)].map(cell).join(";"),
  );
  const csv = "﻿" + [header.map(cell).join(";"), ...lines].join("\r\n");
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="mglabs-oportunidades-${date}.csv"` } });
}
