import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { crmDeals, crmProposalEvents, crmProposalItems, crmProposals, crmServices } from "@/db/schema";
import { PROPOSAL_STATUS } from "@/lib/config/crm";
import { db } from "@/lib/db";
import { proposalTotals } from "@/lib/money";
import { logActivity } from "@/lib/services/activities";
import { assertWrite, audit, NotFoundError, ValidationError, type Ctx } from "@/lib/services/ctx";
import { advanceDeal } from "@/lib/services/deals";
import { cents, dateOnly, optStr, parse, reqStr } from "@/lib/services/util";

// ---------- catálogo ----------

export const serviceInput = z.object({
  name: reqStr(120),
  description: optStr(1000),
  defaultScope: optStr(4000),
  basePriceCents: cents,
  estimatedDays: z.number().int().min(0).max(1000).nullish().transform((v) => v ?? null),
  recurring: z.boolean().default(false),
  active: z.boolean().default(true),
});
export type ServiceInput = z.input<typeof serviceInput>;

export async function listServices(ctx: Ctx, opts: { includeInactive?: boolean } = {}) {
  return db
    .select()
    .from(crmServices)
    .where(and(eq(crmServices.workspaceId, ctx.workspaceId), opts.includeInactive ? undefined : eq(crmServices.active, true)))
    .orderBy(asc(crmServices.position), asc(crmServices.name));
}

export async function saveService(ctx: Ctx, id: string | null, raw: ServiceInput) {
  assertWrite(ctx);
  const i = parse(serviceInput, raw);
  if (!id) {
    const [row] = await db.insert(crmServices).values({ ...i, workspaceId: ctx.workspaceId }).returning();
    return row;
  }
  const [row] = await db.update(crmServices).set({ ...i, updatedAt: new Date() }).where(and(eq(crmServices.id, id), eq(crmServices.workspaceId, ctx.workspaceId))).returning();
  if (!row) throw new NotFoundError("Serviço");
  return row;
}

// ---------- propostas ----------

export const proposalItemInput = z.object({
  serviceId: z.string().uuid().nullish().transform((v) => v ?? null),
  description: reqStr(300),
  quantity: z.number().int().min(1).max(1000).default(1),
  unitPriceCents: z.number().int().min(0).max(1_000_000_000_00).default(0),
});

export const proposalInput = z.object({
  dealId: z.string().uuid().nullish().transform((v) => v ?? null),
  companyId: z.string().uuid(),
  contactId: z.string().uuid().nullish().transform((v) => v ?? null),
  title: reqStr(200),
  diagnosis: optStr(4000),
  scope: optStr(8000),
  deliverables: optStr(4000),
  timeline: optStr(2000),
  revisionsIncluded: z.number().int().min(0).max(50).nullish().transform((v) => v ?? null),
  paymentTerms: optStr(2000),
  installments: z.number().int().min(1).max(60).default(1),
  discountCents: z.number().int().min(0).default(0),
  validUntil: dateOnly,
  notes: optStr(2000),
  items: z.array(proposalItemInput).max(50).default([]),
});
export type ProposalInput = z.input<typeof proposalInput>;

type ProposalRow = typeof crmProposals.$inferSelect;

async function own(ctx: Ctx, id: string): Promise<ProposalRow> {
  const [p] = await db.select().from(crmProposals).where(and(eq(crmProposals.id, id), eq(crmProposals.workspaceId, ctx.workspaceId)));
  if (!p) throw new NotFoundError("Proposta");
  return p;
}

async function event(ctx: Ctx, proposalId: string, kind: string, note?: string) {
  await db.insert(crmProposalEvents).values({ proposalId, kind, note: note ?? null, authorId: ctx.userId });
}

export async function listProposals(ctx: Ctx, f: { status?: string; dealId?: string; companyId?: string } = {}) {
  const rows = await db.query.crmProposals.findMany({
    where: (t, { and: a, eq: e }) => a(e(t.workspaceId, ctx.workspaceId), f.status ? e(t.status, f.status) : undefined, f.dealId ? e(t.dealId, f.dealId) : undefined, f.companyId ? e(t.companyId, f.companyId) : undefined),
    orderBy: (t, { desc: d }) => d(t.updatedAt),
    limit: 200,
  });
  return rows;
}

export async function getProposal(ctx: Ctx, id: string) {
  const proposal = await own(ctx, id);
  const [items, events] = await Promise.all([
    db.select().from(crmProposalItems).where(eq(crmProposalItems.proposalId, id)).orderBy(asc(crmProposalItems.position)),
    db.select().from(crmProposalEvents).where(eq(crmProposalEvents.proposalId, id)).orderBy(desc(crmProposalEvents.createdAt)),
  ]);
  return { proposal, items, events, totals: proposalTotals(items, proposal.discountCents) };
}

export async function createProposal(ctx: Ctx, raw: ProposalInput) {
  assertWrite(ctx);
  const i = parse(proposalInput, raw);
  const { items, ...head } = i;
  const totals = proposalTotals(items, head.discountCents);
  const [row] = await db.insert(crmProposals).values({ ...head, workspaceId: ctx.workspaceId, createdBy: ctx.userId, totalCents: totals.totalCents, discountCents: totals.discountCents }).returning();
  if (items.length) await db.insert(crmProposalItems).values(items.map((it, n) => ({ ...it, proposalId: row.id, position: n })));
  await event(ctx, row.id, "criada");
  await logActivity(ctx, { dealId: row.dealId, companyId: row.companyId, kind: "proposta", content: `Rascunho de proposta criado: ${row.title}`, meta: { proposalId: row.id } });
  await audit(ctx, "create", "proposal", row.id);
  return row;
}

/** Só rascunhos são editáveis. Depois de enviada, a proposta vira registro: crie uma nova versão. */
export async function updateProposal(ctx: Ctx, id: string, raw: ProposalInput) {
  assertWrite(ctx);
  const cur = await own(ctx, id);
  if (cur.status !== "rascunho") throw new ValidationError("Proposta já enviada não pode ser editada. Crie uma nova versão.");
  const i = parse(proposalInput, raw);
  const { items, ...head } = i;
  const totals = proposalTotals(items, head.discountCents);
  await db.transaction(async (tx) => {
    await tx.update(crmProposals).set({ ...head, totalCents: totals.totalCents, discountCents: totals.discountCents, updatedAt: new Date() }).where(eq(crmProposals.id, id));
    await tx.delete(crmProposalItems).where(eq(crmProposalItems.proposalId, id));
    if (items.length) await tx.insert(crmProposalItems).values(items.map((it, n) => ({ ...it, proposalId: id, position: n })));
  });
  await audit(ctx, "update", "proposal", id);
  return own(ctx, id);
}

const TRANSITIONS: Record<string, string[]> = {
  rascunho: ["enviada"],
  enviada: ["visualizada", "aprovada", "recusada", "expirada"],
  visualizada: ["aprovada", "recusada", "expirada"],
  aprovada: [],
  recusada: [],
  expirada: [],
};

export async function setProposalStatus(ctx: Ctx, id: string, status: string, note?: string) {
  assertWrite(ctx);
  if (!PROPOSAL_STATUS.some((s) => s.id === status)) throw new ValidationError("Status inválido.");
  const cur = await own(ctx, id);
  if (!TRANSITIONS[cur.status]?.includes(status)) throw new ValidationError(`Não é possível ir de "${cur.status}" para "${status}".`);
  if (status === "enviada") {
    const items = await db.select().from(crmProposalItems).where(eq(crmProposalItems.proposalId, id));
    if (!items.length) throw new ValidationError("Adicione ao menos um item antes de marcar como enviada.");
  }
  const now = new Date();
  const [row] = await db
    .update(crmProposals)
    .set({ status, updatedAt: now, ...(status === "enviada" ? { sentAt: now } : {}), ...(["aprovada", "recusada", "expirada"].includes(status) ? { decidedAt: now } : {}) })
    .where(eq(crmProposals.id, id))
    .returning();
  await event(ctx, id, status, note);
  await logActivity(ctx, { dealId: row.dealId, companyId: row.companyId, kind: "proposta", content: `Proposta "${row.title}" (v${row.version}): ${status}${note ? ` — ${note}` : ""}`, meta: { proposalId: id, status } });
  if (status === "enviada" && row.dealId) await advanceDeal(ctx, row.dealId, "proposta").catch(() => null);
  if (status === "aprovada" && row.dealId) {
    // O valor do negócio passa a refletir o que foi aprovado; marcar como ganho continua sendo decisão sua.
    await db.update(crmDeals).set({ estimatedValueCents: row.totalCents, updatedAt: now }).where(eq(crmDeals.id, row.dealId));
    await advanceDeal(ctx, row.dealId, "negociacao").catch(() => null);
  }
  await audit(ctx, "status", "proposal", id, { status });
  return row;
}

/** Nova versão (cópia editável); a anterior permanece intacta. */
export async function newProposalVersion(ctx: Ctx, id: string) {
  assertWrite(ctx);
  const { proposal, items } = await getProposal(ctx, id);
  const [row] = await db
    .insert(crmProposals)
    .values({
      workspaceId: ctx.workspaceId, dealId: proposal.dealId, companyId: proposal.companyId, contactId: proposal.contactId, title: proposal.title,
      status: "rascunho", version: proposal.version + 1, previousId: proposal.id, diagnosis: proposal.diagnosis, scope: proposal.scope,
      deliverables: proposal.deliverables, timeline: proposal.timeline, revisionsIncluded: proposal.revisionsIncluded, paymentTerms: proposal.paymentTerms,
      installments: proposal.installments, discountCents: proposal.discountCents, validUntil: proposal.validUntil, notes: proposal.notes, totalCents: proposal.totalCents, createdBy: ctx.userId,
    })
    .returning();
  if (items.length) await db.insert(crmProposalItems).values(items.map((it, n) => ({ proposalId: row.id, serviceId: it.serviceId, description: it.description, quantity: it.quantity, unitPriceCents: it.unitPriceCents, position: n })));
  await event(ctx, row.id, "criada", `Nova versão a partir da v${proposal.version}`);
  return row;
}

export async function deleteProposalDraft(ctx: Ctx, id: string) {
  assertWrite(ctx);
  const cur = await own(ctx, id);
  if (cur.status !== "rascunho") throw new ValidationError("Só rascunhos podem ser excluídos.");
  await db.delete(crmProposals).where(eq(crmProposals.id, id));
  await audit(ctx, "delete", "proposal", id);
}
