import { connection } from "next/server";

import { requireUser, UnauthorizedError } from "@/lib/auth/require";
import { getCategory } from "@/lib/config/categories";
import { crmBoard } from "@/lib/queries";
import { STAGES } from "@/lib/types";

function cell(v: unknown): string {
  const s = v == null ? "" : String(v);
  // evita injeção de fórmula ao abrir no Excel/Sheets
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// Exporta o CRM. Dados próprios + contatos do site da empresa e do Overture; dados do Google ficam de fora.
export async function GET() {
  await connection();
  try {
    await requireUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return Response.json({ error: e.message }, { status: 401 });
    throw e;
  }
  const leads = await crmBoard();
  const header = ["Nome", "Categoria", "Bairro", "Cidade", "Etapa", "Oferta", "Valor previsto (R$)", "Próximo passo", "Data do próximo passo", "Lead Score", "WhatsApp (site)", "E-mail (site)", "Instagram (site)", "Motivo da perda", "Fonte", "ID externo"];
  const lines = leads.map((l) => {
    const site = l.place.contacts.filter((c) => c.source === "site_empresa" || c.source === "overture");
    const pick = (k: string) => site.filter((c) => c.kind === k).map((c) => c.value).join(" ");
    return [
      l.place.name,
      getCategory(l.place.category ?? "")?.label ?? l.place.category,
      l.place.neighborhood,
      l.place.city,
      STAGES.find((s) => s.id === l.stage)?.label ?? l.stage,
      l.offer,
      l.expectedValue,
      l.nextStep,
      l.nextStepAt ? new Date(l.nextStepAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "",
      l.place.score,
      pick("whatsapp"),
      pick("email"),
      pick("instagram"),
      l.lostReason,
      l.place.source === "overture" ? "Overture Maps" : "Google",
      l.place.overtureId ?? l.place.googlePlaceId,
    ].map(cell).join(";");
  });
  const csv = "﻿" + [header.map(cell).join(";"), ...lines].join("\r\n");
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="crm-radar-${date}.csv"` },
  });
}
