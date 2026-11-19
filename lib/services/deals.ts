import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { crmCompanies, crmContacts, crmDeals, crmStages } from "@/db/schema";
import { SOURCES } from "@/lib/config/crm";
import { db } from "@/lib/db";
import { logActivity, timelineFor } from "@/lib/services/activities";
import { companyFromPlace, createCompany, stageByKey, companyInput } from "@/lib/services/companies";
import { assertAdmin, assertAnyModule, assertModule, assertWrite, audit, ForbiddenError, NotFoundError, ValidationError, type Ctx } from "@/lib/services/ctx";
import { cents, dateOnly, instant, limitOf, optStr, parse, reqStr, tagsSchema } from "@/lib/services/util";

const sourceIds = SOURCES.map((s) => s.id) as [string, ...string[]];

export async function listStages(ctx: Ctx) {
  assertAnyModule(ctx, "comercial", "operacao", "financeiro");
  return db.select().from(crmStages).where(eq(crmStages.workspaceId, ctx.workspaceId)).orderBy(asc(crmStages.position));
}

export type DealCard = {
  id: string;
  title: string;
  companyId: string;
  companyName: string;
  category: string | null;
  city: string | null;
  stageId: string;
  stageKey: string;
  stageKind: string;
  valueCents: number | null;
  probability: number;
  source: string;
  serviceType: string | null;
  nextStep: string | null;
  nextStepAt: Date | null;
  expectedCloseAt: string | null;
  lostReason: string | null;
  tags: string[];
  score: number | null;
  placeId: string | null;
  contactName: string | null;
  openTasks: number;
  lastActivityAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type DealRowRaw = {
  id: string; title: string; company_id: string; company_name: string; category: string | null; city: string | null;
  stage_id: string; stage_key: string; stage_kind: string; stage_prob: number; value: string | null; probability: number | null;
  source: string; service_type: string | null; next_step: string | null; next_step_at: string | null; expected_close_at: string | null;
  lost_reason: string | null; tags: string[] | null; score: number | null; place_id: string | null; contact_name: string | null;
  open_tasks: number; last_activity_at: string | null; created_at: string; updated_at: string;
};

const DEAL_SELECT = sql`
  select d.id, d.title, d.company_id, c.name as company_name, c.category, c.city, c.place_id,
         d.stage_id, s.key as stage_key, s.kind as stage_kind, s.probability as stage_prob,
         d.estimated_value_cents::text as value, d.probability, d.source, d.service_type, d.next_step, d.next_step_at,
         d.expected_close_at::text as expected_close_at, d.lost_reason, d.tags,
         ls.total as score, k.name as contact_name,
         (select count(*)::int from crm_tasks t where t.deal_id = d.id and t.status in ('pendente','em_andamento')) as open_tasks,
         d.last_activity_at, d.created_at, d.updated_at
  from crm_deals d
  join crm_companies c on c.id = d.company_id
  join crm_stages s on s.id = d.stage_id
  left join crm_contacts k on k.id = d.primary_contact_id
  left join lead_scores ls on ls.place_id = c.place_id`;

function toCard(r: DealRowRaw): DealCard {
  return {
    id: r.id, title: r.title, companyId: r.company_id, companyName: r.company_name, category: r.category, city: r.city,
    stageId: r.stage_id, stageKey: r.stage_key, stageKind: r.stage_kind, valueCents: r.value == null ? null : Number(r.value),
    probability: r.probability ?? r.stage_prob, source: r.source, serviceType: r.service_type, nextStep: r.next_step,
    nextStepAt: r.next_step_at ? new Date(r.next_step_at) : null, expectedCloseAt: r.expected_close_at, lostReason: r.lost_reason,
    tags: r.tags ?? [], score: r.score, placeId: r.place_id, contactName: r.contact_name, openTasks: r.open_tasks,
    lastActivityAt: r.last_activity_at ? new Date(r.last_activity_at) : null, createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at),
  };
}

export type DealFilters = { q?: string; stage?: string; source?: string; service?: string; companyId?: string; overdue?: boolean; open?: boolean; limit?: number };

export async function listDeals(ctx: Ctx, f: DealFilters = {}): Promise<DealCard[]> {
  assertModule(ctx, "comercial");
  const q = f.q?.trim();
  const { rows } = await db.execute<DealRowRaw>(sql`
    ${DEAL_SELECT}
    where d.workspace_id = ${ctx.workspaceId}
      ${f.stage ? sql`and s.key = ${f.stage}` : sql``}
      ${f.source ? sql`and d.source = ${f.source}` : sql``}
      ${f.service ? sql`and d.service_type = ${f.service}` : sql``}
      ${f.companyId ? sql`and d.company_id = ${f.companyId}` : sql``}
      ${f.open ? sql`and s.kind = 'open'` : sql``}
      ${f.overdue ? sql`and s.kind = 'open' and d.next_step_at < now()` : sql``}
      ${q ? sql`and (d.title ilike ${"%" + q + "%"} or c.name ilike ${"%" + q + "%"} or d.next_step ilike ${"%" + q + "%"})` : sql``}
    order by (s.kind <> 'open'), d.next_step_at asc nulls last, d.updated_at desc
    limit ${limitOf(f.limit, 500, 1000)}`);
  return rows.map(toCard);
}

export async function getDealCard(ctx: Ctx, id: string): Promise<DealCard> {
  assertModule(ctx, "comercial");
  const { rows } = await db.execute<DealRowRaw>(sql`${DEAL_SELECT} where d.workspace_id = ${ctx.workspaceId} and d.id = ${id}`);
  if (!rows[0]) throw new NotFoundError("Oportunidade");
  return toCard(rows[0]);
}

/** Ficha completa da oportunidade (drawer do CRM e MCP get_lead). */
export async function getDeal(ctx: Ctx, id: string) {
  assertModule(ctx, "comercial");
  const card = await getDealCard(ctx, id);
  const [deal] = await db.select().from(crmDeals).where(eq(crmDeals.id, id));
  const [company] = await db.select().from(crmCompanies).where(eq(crmCompanies.id, card.companyId));
  const contacts = await db.select().from(crmContacts).where(eq(crmContacts.companyId, card.companyId)).orderBy(crmContacts.name);
  const [tasks, proposals, project, rules, timeline] = await Promise.all([
    db.execute<{ id: string; title: string; status: string; priority: string; due_at: string | null }>(sql`
      select id, title, status, priority, due_at from crm_tasks where deal_id = ${id} order by (status in ('concluida','cancelada')), due_at nulls last`),
    db.execute<{ id: string; title: string; status: string; version: number; total: string }>(sql`select id, title, status, version, total_cents::text as total from crm_proposals where deal_id = ${id} order by created_at desc`),
    db.execute<{ id: string; name: string }>(sql`select id, name from crm_projects where deal_id = ${id} limit 1`),
    card.placeId ? db.execute<{ rules: unknown }>(sql`select rules from lead_scores where place_id = ${card.placeId}`) : Promise.resolve({ rows: [] as { rules: unknown }[] }),
    timelineFor(ctx, { dealId: id }, 150),
  ]);
  return {
    card,
    deal,
    company,
    contacts,
    tasks: tasks.rows.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, dueAt: t.due_at ? new Date(t.due_at) : null })),
    proposals: proposals.rows.map((p) => ({ id: p.id, title: p.title, status: p.status, version: p.version, totalCents: Number(p.total) })),
    project: project.rows[0] ?? null,
    scoreRules: (rules.rows[0]?.rules as { label: string; points: number }[] | undefined) ?? [],
    timeline,
  };
}

export const dealInput = z.object({
  companyId: z.string().uuid(),
  primaryContactId: z.string().uuid().nullish().transform((v) => v ?? null),
  title: reqStr(200),
  serviceType: optStr(120),
  estimatedValueCents: cents,
  probability: z.number().int().min(0).max(100).nullish().transform((v) => v ?? null),
  source: z.enum(sourceIds).default("manual"),
  stage: z.string().default("novo"),
  nextStep: optStr(300),
  nextStepAt: instant,
  expectedCloseAt: dateOnly,
  tags: tagsSchema,
  notes: optStr(4000),
});
export type DealInput = z.input<typeof dealInput>;

export async function createDeal(ctx: Ctx, raw: DealInput): Promise<DealCard> {
  assertWrite(ctx);
  assertModule(ctx, "comercial");
  const i = parse(dealInput, raw);
  const [company] = await db.select({ id: crmCompanies.id }).from(crmCompanies).where(and(eq(crmCompanies.id, i.companyId), eq(crmCompanies.workspaceId, ctx.workspaceId)));
  if (!company) throw new NotFoundError("Empresa");
  const stage = await stageByKey(ctx, i.stage);
  const { stage: _s, ...rest } = i;
  void _s;
  const [row] = await db
    .insert(crmDeals)
    .values({ ...rest, workspaceId: ctx.workspaceId, stageId: stage.id, ownerId: ctx.userId, lastActivityAt: new Date() })
    .returning();
  await logActivity(ctx, { dealId: row.id, companyId: row.companyId, kind: "sistema", content: `Oportunidade criada em ${stage.label}`, meta: { to: stage.key } });
  await audit(ctx, "create", "deal", row.id);
  return getDealCard(ctx, row.id);
}

/** Cadastro manual: cria empresa nova (ou usa uma existente) e a oportunidade, independente do Radar. */
export async function createDealWithCompany(ctx: Ctx, input: { companyId?: string; company?: z.input<typeof companyInput>; deal: Omit<DealInput, "companyId"> }): Promise<DealCard> {
  assertWrite(ctx);
  assertModule(ctx, "comercial");
  let companyId = input.companyId;
  if (!companyId) {
    if (!input.company) throw new ValidationError("Informe a empresa.");
    companyId = (await createCompany(ctx, input.company)).id;
  }
  return createDeal(ctx, { ...input.deal, companyId });
}

/** Radar → CRM: empresa + oportunidade sem duplicar. */
export async function addPlaceToCrm(ctx: Ctx, placeId: string, opts: { serviceType?: string | null } = {}): Promise<{ dealId: string; companyId: string; created: boolean }> {
  assertWrite(ctx);
  assertModule(ctx, "comercial");
  const { company, created: companyCreated } = await companyFromPlace(ctx, placeId);
  const [open] = await db
    .select({ id: crmDeals.id, serviceType: crmDeals.serviceType })
    .from(crmDeals)
    .innerJoin(crmStages, eq(crmStages.id, crmDeals.stageId))
    .where(and(eq(crmDeals.companyId, company.id), eq(crmStages.kind, "open")))
    .limit(1);
  if (open) {
    if (opts.serviceType && open.serviceType !== opts.serviceType) {
      await db
        .update(crmDeals)
        .set({ serviceType: opts.serviceType, updatedAt: new Date() })
        .where(and(eq(crmDeals.id, open.id), eq(crmDeals.workspaceId, ctx.workspaceId)));
    }
    return { dealId: open.id, companyId: company.id, created: false };
  }
  const deal = await createDeal(ctx, { companyId: company.id, title: `${opts.serviceType ? opts.serviceType + " — " : ""}${company.name}`, serviceType: opts.serviceType ?? null, source: "radar", stage: "novo" });
  return { dealId: deal.id, companyId: company.id, created: companyCreated || true };
}

export async function updateDeal(ctx: Ctx, id: string, raw: Partial<Omit<DealInput, "companyId" | "stage">>): Promise<DealCard> {
  assertWrite(ctx);
  assertModule(ctx, "comercial");
  const i = parse(dealInput.omit({ companyId: true, stage: true }).partial(), raw);
  const before = await getDealCard(ctx, id);
  const patch: Partial<typeof crmDeals.$inferInsert> = { ...i, updatedAt: new Date() };
  for (const k of Object.keys(patch) as (keyof typeof patch)[]) if (patch[k] === undefined) delete patch[k];
  await db.update(crmDeals).set(patch).where(and(eq(crmDeals.id, id), eq(crmDeals.workspaceId, ctx.workspaceId)));
  const changes: Record<string, { de: unknown; para: unknown }> = {};
  if ("estimatedValueCents" in i && i.estimatedValueCents !== before.valueCents) changes.valor = { de: before.valueCents, para: i.estimatedValueCents };
  if ("nextStep" in i && i.nextStep !== before.nextStep) changes.proximoPasso = { de: before.nextStep, para: i.nextStep };
  if ("nextStepAt" in i && (i.nextStepAt?.getTime() ?? null) !== (before.nextStepAt?.getTime() ?? null)) changes.prazo = { de: before.nextStepAt, para: i.nextStepAt };
  if (Object.keys(changes).length) {
    await logActivity(ctx, { dealId: id, companyId: before.companyId, kind: "sistema", content: "Dados da oportunidade atualizados", meta: { changes } });
  }
  await audit(ctx, "update", "deal", id);
  return getDealCard(ctx, id);
}

/** Move no funil. Perdido exige motivo; ganho/perdido carimbam a data. Reabrir limpa os carimbos. */
export async function moveDeal(ctx: Ctx, id: string, stageKey: string, opts: { lostReason?: string | null } = {}): Promise<DealCard> {
  assertWrite(ctx);
  assertModule(ctx, "comercial");
  const before = await getDealCard(ctx, id);
  const stage = await stageByKey(ctx, stageKey);
  if (before.stageKey === stage.key) return before;
  const lostReason = opts.lostReason?.trim() || null;
  if (stage.kind === "lost" && !lostReason) throw new ValidationError("Informe o motivo da perda.");
  const now = new Date();
  await db
    .update(crmDeals)
    .set({
      stageId: stage.id,
      lostReason: stage.kind === "lost" ? lostReason : null,
      wonAt: stage.kind === "won" ? now : null,
      lostAt: stage.kind === "lost" ? now : null,
      ...(stage.kind !== "open" ? { nextStep: null, nextStepAt: null } : {}),
      updatedAt: now,
    })
    .where(and(eq(crmDeals.id, id), eq(crmDeals.workspaceId, ctx.workspaceId)));
  await logActivity(ctx, {
    dealId: id,
    companyId: before.companyId,
    kind: "etapa",
    content: `Movido de ${(await stageLabel(ctx, before.stageKey)) ?? before.stageKey} para ${stage.label}${lostReason ? ` — ${lostReason}` : ""}`,
    meta: { de: before.stageKey, para: stage.key, motivo: lostReason },
  });
  await audit(ctx, "move", "deal", id, { from: before.stageKey, to: stage.key });
  return getDealCard(ctx, id);
}

/** Avança o negócio só se a etapa de destino vem depois da atual (nunca volta nem mexe em fechados). */
export async function advanceDeal(ctx: Ctx, id: string, stageKey: string) {
  const [cur, target] = await Promise.all([getDealCard(ctx, id), stageByKey(ctx, stageKey)]);
  if (cur.stageKind !== "open") return cur;
  const stages = await listStages(ctx);
  const pos = (k: string) => stages.find((s) => s.key === k)?.position ?? 0;
  return pos(target.key) > pos(cur.stageKey) ? moveDeal(ctx, id, stageKey) : cur;
}

async function stageLabel(ctx: Ctx, key: string) {
  const [s] = await db.select({ label: crmStages.label }).from(crmStages).where(and(eq(crmStages.workspaceId, ctx.workspaceId), eq(crmStages.key, key)));
  return s?.label;
}

export async function addNote(ctx: Ctx, input: { dealId?: string; companyId?: string; kind?: "nota" | "ligacao" | "resposta" | "reuniao"; channel?: string | null; content: string }) {
  assertWrite(ctx);
  assertModule(ctx, "comercial");
  const content = input.content?.trim();
  if (!content) throw new ValidationError("Escreva algo.");
  let companyId = input.companyId ?? null;
  if (input.dealId) {
    const d = await getDealCard(ctx, input.dealId);
    companyId = d.companyId;
    // Uma resposta do cliente tira o negócio de "novo/primeiro contato" para "conversa".
    if (input.kind === "resposta") await advanceDeal(ctx, input.dealId, "conversa");
  }
  return logActivity(ctx, { dealId: input.dealId ?? null, companyId, kind: input.kind ?? "nota", channel: input.channel ?? null, content });
}

export async function deleteDeal(ctx: Ctx, id: string) {
  assertWrite(ctx);
  assertModule(ctx, "comercial");
  assertAdmin(ctx, "Só administradores podem excluir oportunidades.");
  await db.delete(crmDeals).where(and(eq(crmDeals.id, id), eq(crmDeals.workspaceId, ctx.workspaceId)));
  await audit(ctx, "delete", "deal", id);
}

export function pipelineTotals(deals: DealCard[]) {
  const open = deals.filter((d) => d.stageKind === "open");
  return {
    openCount: open.length,
    openCents: open.reduce((s, d) => s + (d.valueCents ?? 0), 0),
    weightedCents: Math.round(open.reduce((s, d) => s + ((d.valueCents ?? 0) * d.probability) / 100, 0)),
    wonCount: deals.filter((d) => d.stageKind === "won").length,
    wonCents: deals.filter((d) => d.stageKind === "won").reduce((s, d) => s + (d.valueCents ?? 0), 0),
  };
}

/** Configurações: renomear etapa e ajustar a probabilidade padrão (a ordem e o tipo ficam fixos). */
export async function updateStage(ctx: Ctx, key: string, patch: { label?: string; probability?: number }) {
  assertWrite(ctx);
  assertModule(ctx, "config");
  if (ctx.role !== "owner" && ctx.role !== "admin") throw new ForbiddenError("Só administradores editam as etapas.");
  const label = patch.label?.trim();
  if (label !== undefined && (!label || label.length > 40)) throw new ValidationError("Nome da etapa inválido.");
  if (patch.probability !== undefined && (!Number.isInteger(patch.probability) || patch.probability < 0 || patch.probability > 100)) throw new ValidationError("Probabilidade inválida.");
  await db
    .update(crmStages)
    .set({ ...(label ? { label } : {}), ...(patch.probability !== undefined ? { probability: patch.probability } : {}) })
    .where(and(eq(crmStages.workspaceId, ctx.workspaceId), eq(crmStages.key, key)));
  await audit(ctx, "update", "stage", key);
}
