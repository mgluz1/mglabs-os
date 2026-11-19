import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { crmCompanies, crmContacts, crmDeals, crmStages, optouts, places } from "@/db/schema";
import { db } from "@/lib/db";
import { parseBrPhone } from "@/lib/phone";
import { logActivity } from "@/lib/services/activities";
import { assertAnyModule, assertModule, assertWrite, audit, type Ctx } from "@/lib/services/ctx";

/** Todos os números de uma empresa/contato, em E.164, para consultar a lista de opt-out. */
function e164s(list: (string | null | undefined)[]): string[] {
  return [...new Set(list.map((p) => parseBrPhone(p)?.e164).filter((x): x is string => !!x))];
}

export type BlockInfo = { blocked: boolean; reason: string | null };

/**
 * Antes de exibir qualquer botão de contato ou gerar mensagem: o negócio/contato pediu para não ser contatado?
 * Consulta a lista antiga (optouts) e a marca no contato do CRM.
 */
export async function contactBlock(ctx: Ctx, input: { companyId?: string | null; contactId?: string | null; phones?: (string | null | undefined)[] }): Promise<BlockInfo> {
  assertAnyModule(ctx, "comercial", "operacao");
  let placeId: string | null = null;
  const phones = [...(input.phones ?? [])];
  if (input.companyId) {
    const [c] = await db.select({ phone: crmCompanies.phone, placeId: crmCompanies.placeId }).from(crmCompanies).where(and(eq(crmCompanies.id, input.companyId), eq(crmCompanies.workspaceId, ctx.workspaceId)));
    if (c) {
      placeId = c.placeId;
      phones.push(c.phone);
    }
  }
  if (input.contactId) {
    const [k] = await db.select().from(crmContacts).where(and(eq(crmContacts.id, input.contactId), eq(crmContacts.workspaceId, ctx.workspaceId)));
    if (k?.optedOut) return { blocked: true, reason: "Este contato pediu para não ser contatado." };
    if (k) phones.push(k.phone, k.whatsapp);
  }
  const nums = e164s(phones);
  const [hit] = await db
    .select({ id: optouts.id })
    .from(optouts)
    .where(
      sql`(${nums.length ? sql`${optouts.phone} in (${sql.join(nums.map((n) => sql`${n}`), sql`, `)})` : sql`false`})
          or (${placeId ? sql`exists (select 1 from places p where p.id = ${placeId} and (p.overture_id = ${optouts.overtureId} or p.google_place_id = ${optouts.googlePlaceId}))` : sql`false`})`,
    )
    .limit(1);
  if (hit) return { blocked: true, reason: "Este negócio pediu para não ser contatado." };
  if (nums.length) {
    const [k] = await db.select({ id: crmContacts.id }).from(crmContacts).where(and(eq(crmContacts.workspaceId, ctx.workspaceId), eq(crmContacts.optedOut, true), sql`(${crmContacts.phone} in (${sql.join(nums.map((n) => sql`${n}`), sql`, `)}) or ${crmContacts.whatsapp} in (${sql.join(nums.map((n) => sql`${n}`), sql`, `)}))`))
      .limit(1);
    if (k) return { blocked: true, reason: "Este contato pediu para não ser contatado." };
  }
  return { blocked: false, reason: null };
}

/** Registra o pedido de não contato (empresa inteira ou um contato) e encerra as negociações abertas. */
export async function registerOptOut(ctx: Ctx, input: { companyId: string; contactId?: string | null; reason?: string | null }) {
  assertWrite(ctx);
  assertModule(ctx, "comercial");
  const [company] = await db.select().from(crmCompanies).where(and(eq(crmCompanies.id, input.companyId), eq(crmCompanies.workspaceId, ctx.workspaceId)));
  if (!company) throw new Error("Empresa não encontrada.");
  const reason = input.reason?.trim() || "Pediu para não ser contatado";
  const phones: (string | null)[] = [];
  let ov: string | null = null;
  let gp: string | null = null;
  if (input.contactId) {
    const [k] = await db.update(crmContacts).set({ optedOut: true, optedOutAt: new Date() }).where(and(eq(crmContacts.id, input.contactId), eq(crmContacts.workspaceId, ctx.workspaceId))).returning();
    if (k) phones.push(k.phone, k.whatsapp);
  } else {
    await db.update(crmContacts).set({ optedOut: true, optedOutAt: new Date() }).where(and(eq(crmContacts.companyId, company.id), eq(crmContacts.workspaceId, ctx.workspaceId)));
    const ks = await db.select().from(crmContacts).where(eq(crmContacts.companyId, company.id));
    for (const k of ks) phones.push(k.phone, k.whatsapp);
    phones.push(company.phone);
    if (company.placeId) {
      const [p] = await db.select({ ov: places.overtureId, g: places.googlePlaceId }).from(places).where(eq(places.id, company.placeId));
      ov = p?.ov ?? null;
      gp = p?.g ?? null;
    }
  }
  const nums = e164s(phones);
  if (ov || gp) await db.insert(optouts).values({ overtureId: ov, googlePlaceId: gp, reason });
  for (const n of nums) await db.insert(optouts).values({ phone: n, overtureId: ov, googlePlaceId: gp, reason });
  if (!input.contactId) {
    const [lost] = await db.select({ id: crmStages.id }).from(crmStages).where(and(eq(crmStages.workspaceId, ctx.workspaceId), eq(crmStages.key, "perdido")));
    const open = await db.select({ id: crmDeals.id, stageId: crmDeals.stageId }).from(crmDeals).innerJoin(crmStages, eq(crmStages.id, crmDeals.stageId)).where(and(eq(crmDeals.companyId, company.id), eq(crmStages.kind, "open")));
    if (open.length && lost) {
      await db.update(crmDeals).set({ stageId: lost.id, lostReason: "Pediu para não ser contatado", lostAt: new Date(), nextStep: null, nextStepAt: null, updatedAt: new Date() }).where(inArray(crmDeals.id, open.map((o) => o.id)));
    }
  }
  await logActivity(ctx, { companyId: company.id, contactId: input.contactId ?? null, kind: "optout", content: reason });
  await audit(ctx, "optout", "company", company.id, { contactId: input.contactId ?? null });
}
