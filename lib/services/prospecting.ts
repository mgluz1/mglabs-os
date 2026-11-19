import "server-only";

import { and, eq } from "drizzle-orm";

import { crmCompanies } from "@/db/schema";
import { addDays, ymdSP } from "@/lib/dates";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/services/activities";
import { companyFromPlace } from "@/lib/services/companies";
import { assertModule, assertWrite, audit, ValidationError, type Ctx } from "@/lib/services/ctx";
import { addPlaceToCrm, advanceDeal } from "@/lib/services/deals";
import { createTask } from "@/lib/services/tasks";

export type ProspectActionInput =
  | { action: "ignorar"; reason?: string | null }
  | { action: "restaurar" }
  | { action: "adiar"; days?: number }
  | { action: "contatado"; offer?: string | null; channel?: string | null };

export async function setPlaceProspectState(ctx: Ctx, placeId: string, input: ProspectActionInput) {
  assertWrite(ctx);
  assertModule(ctx, "comercial");

  const { company } = await companyFromPlace(ctx, placeId);
  const meta = { ...((company.metadata as Record<string, unknown> | null) ?? {}) };
  const now = new Date();

  if (input.action === "ignorar") {
    meta.ignoredAt = now.toISOString();
    meta.ignoredReason = input.reason?.trim().slice(0, 200) || null;
    delete meta.snoozeUntil;
    await db
      .update(crmCompanies)
      .set({ metadata: meta, updatedAt: now })
      .where(and(eq(crmCompanies.id, company.id), eq(crmCompanies.workspaceId, ctx.workspaceId)));
    await audit(ctx, "ignore", "company", company.id, { placeId });
    return { status: "ignorado" as const };
  }

  if (input.action === "restaurar") {
    delete meta.ignoredAt;
    delete meta.ignoredReason;
    delete meta.snoozeUntil;
    await db
      .update(crmCompanies)
      .set({ metadata: meta, updatedAt: now })
      .where(and(eq(crmCompanies.id, company.id), eq(crmCompanies.workspaceId, ctx.workspaceId)));
    await audit(ctx, "restore", "company", company.id, { placeId });
    return { status: "ativo" as const };
  }

  if (input.action === "adiar") {
    const days = Math.min(Math.max(Math.round(input.days ?? 7), 1), 90);
    if (!Number.isFinite(days)) throw new ValidationError("Prazo inválido.");
    const until = addDays(now, days);
    delete meta.ignoredAt;
    meta.snoozeUntil = until.toISOString();
    await db
      .update(crmCompanies)
      .set({ metadata: meta, updatedAt: now })
      .where(and(eq(crmCompanies.id, company.id), eq(crmCompanies.workspaceId, ctx.workspaceId)));
    await audit(ctx, "snooze", "company", company.id, { placeId, days });
    return { status: "adiado" as const, snoozedUntil: until.toISOString() };
  }

  // "contatado": registra contato manual, garante oportunidade no CRM em "primeiro_contato" e agenda follow-up em 3 dias
  delete meta.ignoredAt;
  delete meta.snoozeUntil;
  await db
    .update(crmCompanies)
    .set({ metadata: meta, updatedAt: now })
    .where(and(eq(crmCompanies.id, company.id), eq(crmCompanies.workspaceId, ctx.workspaceId)));

  const deal = await addPlaceToCrm(ctx, placeId, { serviceType: input.offer ?? null });
  await advanceDeal(ctx, deal.dealId, "primeiro_contato").catch(() => null);
  await logActivity(ctx, {
    dealId: deal.dealId,
    companyId: company.id,
    kind: "mensagem_enviada",
    channel: input.channel ?? "whatsapp",
    content: "Contato registrado pela fila de prospecção do Radar",
  });
  const followAt = addDays(now, 3);
  await createTask(ctx, {
    title: "Follow-up da abordagem",
    dueAt: followAt,
    dealId: deal.dealId,
    companyId: company.id,
    priority: "media",
    source: "automacao",
    dedupeKey: `radar-followup:${deal.dealId}:${ymdSP(now)}`,
  });
  await audit(ctx, "mark_contacted", "deal", deal.dealId, { placeId });
  return { status: "contatado" as const, dealId: deal.dealId };
}
