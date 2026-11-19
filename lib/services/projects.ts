import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { crmCompanies, crmDeals, crmProjectDocuments, crmProjects, crmProposals, crmStages } from "@/db/schema";
import { PROJECT_PHASES, PROJECT_STATUS } from "@/lib/config/crm";
import { addDays } from "@/lib/dates";
import { db } from "@/lib/db";
import { logActivity, timelineFor } from "@/lib/services/activities";
import { assertAnyModule, assertModule, assertWrite, audit, canModule, NotFoundError, ValidationError, type Ctx } from "@/lib/services/ctx";
import { createReceivables } from "@/lib/services/finance";
import { createTask } from "@/lib/services/tasks";
import { dateOnly, optStr, parse, reqStr } from "@/lib/services/util";

const phaseIds = PROJECT_PHASES.map((p) => p.id) as [string, ...string[]];
const statusIds = PROJECT_STATUS.map((s) => s.id) as [string, ...string[]];
const SECTION_KEYS = PROJECT_PHASES.map((p) => p.id);

type ProjectRow = typeof crmProjects.$inferSelect;

async function own(ctx: Ctx, id: string): Promise<ProjectRow> {
  const [p] = await db.select().from(crmProjects).where(and(eq(crmProjects.id, id), eq(crmProjects.workspaceId, ctx.workspaceId)));
  if (!p) throw new NotFoundError("Projeto");
  return p;
}

const PHASE_TASKS: Record<string, string[]> = {
  briefing: ["Reunir objetivo, público e referências com o cliente", "Consolidar e aprovar o briefing"],
  materiais: ["Inventariar logos, fotos e textos recebidos", "Confirmar direitos de uso dos materiais"],
  direcao_criativa: ["Definir a direção criativa e validar com o cliente"],
  desenvolvimento: ["Desenvolver e revisar nos breakpoints principais", "Rodar QA de desempenho e acessibilidade"],
  entrega: ["Publicar com aprovação do cliente", "Enviar documentos finais e registrar o aceite"],
};

/**
 * Fecha o negócio (se ainda não estava) e cria cliente + projeto + cobranças planejadas.
 * Idempotente: um negócio gera no máximo um projeto (índice único) e as cobranças só nascem uma vez.
 * A tela pede confirmação antes de chamar.
 */
export async function convertDealToProject(ctx: Ctx, dealId: string, opts: { createReceivables?: boolean; dueDate?: string } = {}) {
  assertWrite(ctx);
  assertModule(ctx, "comercial");
  assertModule(ctx, "operacao");
  const [deal] = await db.select().from(crmDeals).where(and(eq(crmDeals.id, dealId), eq(crmDeals.workspaceId, ctx.workspaceId)));
  if (!deal) throw new NotFoundError("Oportunidade");
  const [existing] = await db.select().from(crmProjects).where(eq(crmProjects.dealId, dealId));
  if (existing) return { projectId: existing.id, created: false };

  const [won] = await db.select().from(crmStages).where(and(eq(crmStages.workspaceId, ctx.workspaceId), eq(crmStages.key, "ganho")));
  const [proposal] = await db.select().from(crmProposals).where(and(eq(crmProposals.dealId, dealId), eq(crmProposals.status, "aprovada"))).orderBy(desc(crmProposals.decidedAt)).limit(1);
  const [company] = await db.select().from(crmCompanies).where(eq(crmCompanies.id, deal.companyId));

  const project = await db.transaction(async (tx) => {
    const now = new Date();
    await tx.update(crmDeals).set({ stageId: won.id, wonAt: deal.wonAt ?? now, lostAt: null, lostReason: null, nextStep: null, nextStepAt: null, updatedAt: now }).where(eq(crmDeals.id, dealId));
    await tx.update(crmCompanies).set({ status: "cliente", updatedAt: now }).where(eq(crmCompanies.id, deal.companyId));
    const [p] = await tx
      .insert(crmProjects)
      .values({
        workspaceId: ctx.workspaceId, companyId: deal.companyId, dealId, proposalId: proposal?.id ?? null,
        name: deal.title, serviceType: deal.serviceType, scope: proposal?.scope ?? null,
        dueDate: null, sections: {}, links: [],
      })
      .onConflictDoNothing()
      .returning();
    return p ?? null;
  });
  if (!project) {
    const [again] = await db.select().from(crmProjects).where(eq(crmProjects.dealId, dealId));
    return { projectId: again.id, created: false };
  }
  await logActivity(ctx, { dealId, companyId: deal.companyId, projectId: project.id, kind: "projeto", content: `Negócio fechado e projeto criado: ${project.name}`, meta: { projectId: project.id } });

  // Checklist inicial por fase (dedupe garante que reexecutar não duplica).
  let n = 0;
  for (const [phase, titles] of Object.entries(PHASE_TASKS)) {
    for (const title of titles) {
      await createTask(ctx, { title, projectId: project.id, companyId: deal.companyId, dueAt: addDays(new Date(), 3 + n * 2), priority: "media", source: "automacao", dedupeKey: `proj:${project.id}:${phase}:${n}` });
      n++;
    }
  }
  // Cobranças planejadas a partir da proposta aprovada (ou do valor do negócio), só com confirmação.
  const amount = proposal?.totalCents ?? deal.estimatedValueCents ?? 0;
  if (opts.createReceivables && amount > 0 && canModule(ctx, "financeiro")) {
    assertModule(ctx, "financeiro");
    await createReceivables(ctx, {
      companyId: deal.companyId, projectId: project.id, dealId, proposalId: proposal?.id ?? null,
      description: `${project.name}${company ? "" : ""}`, amountCents: amount, dueDate: opts.dueDate ?? addDays(new Date(), 7).toISOString().slice(0, 10), installments: proposal?.installments ?? 1,
    });
  }
  await audit(ctx, "convert", "project", project.id, { dealId });
  return { projectId: project.id, created: true };
}

export const projectInput = z.object({
  name: reqStr(200),
  serviceType: optStr(120),
  scope: optStr(8000),
  status: z.enum(statusIds).default("planejado"),
  phase: z.enum(phaseIds).default("briefing"),
  dueDate: dateOnly,
  notes: optStr(8000),
});
export type ProjectInput = z.input<typeof projectInput>;

export async function createProject(ctx: Ctx, raw: ProjectInput & { companyId: string }) {
  assertWrite(ctx);
  assertModule(ctx, "operacao");
  const { companyId, ...rest } = raw;
  const i = parse(projectInput, rest);
  const [co] = await db.select({ id: crmCompanies.id }).from(crmCompanies).where(and(eq(crmCompanies.id, companyId), eq(crmCompanies.workspaceId, ctx.workspaceId)));
  if (!co) throw new NotFoundError("Empresa");
  const [row] = await db.insert(crmProjects).values({ ...i, workspaceId: ctx.workspaceId, companyId }).returning();
  await db.update(crmCompanies).set({ status: "cliente" }).where(and(eq(crmCompanies.id, companyId), eq(crmCompanies.status, "lead")));
  await logActivity(ctx, { companyId, projectId: row.id, kind: "projeto", content: `Projeto criado: ${row.name}` });
  await audit(ctx, "create", "project", row.id);
  return row;
}

export async function updateProject(ctx: Ctx, id: string, raw: Partial<ProjectInput>) {
  assertWrite(ctx);
  assertModule(ctx, "operacao");
  const cur = await own(ctx, id);
  const i = parse(projectInput.partial(), raw);
  const patch: Partial<typeof crmProjects.$inferInsert> = { ...i, updatedAt: new Date() };
  if (i.status === "entregue" && cur.status !== "entregue") patch.deliveredAt = new Date();
  for (const k of Object.keys(patch) as (keyof typeof patch)[]) if (patch[k] === undefined) delete patch[k];
  const [row] = await db.update(crmProjects).set(patch).where(eq(crmProjects.id, id)).returning();
  if (i.status && i.status !== cur.status) await logActivity(ctx, { companyId: cur.companyId, dealId: cur.dealId, projectId: id, kind: "projeto", content: `Status do projeto: ${i.status}`, meta: { de: cur.status, para: i.status } });
  if (i.phase && i.phase !== cur.phase) await logActivity(ctx, { companyId: cur.companyId, dealId: cur.dealId, projectId: id, kind: "projeto", content: `Fase do projeto: ${i.phase}`, meta: { de: cur.phase, para: i.phase } });
  return row;
}

export async function saveSection(ctx: Ctx, id: string, section: string, text: string) {
  assertWrite(ctx);
  assertModule(ctx, "operacao");
  if (!SECTION_KEYS.includes(section as never)) throw new ValidationError("Seção inválida.");
  const cur = await own(ctx, id);
  const sections = { ...(cur.sections as Record<string, string>), [section]: text.slice(0, 20000) };
  await db.update(crmProjects).set({ sections, updatedAt: new Date() }).where(eq(crmProjects.id, id));
}

export async function setLinks(ctx: Ctx, id: string, links: { label: string; url: string }[]) {
  assertWrite(ctx);
  assertModule(ctx, "operacao");
  await own(ctx, id);
  const clean = links
    .map((l) => ({ label: l.label.trim().slice(0, 100), url: l.url.trim().slice(0, 500) }))
    .filter((l) => l.url && /^https?:\/\//i.test(l.url))
    .slice(0, 30);
  await db.update(crmProjects).set({ links: clean, updatedAt: new Date() }).where(eq(crmProjects.id, id));
}

export const documentInput = z.object({
  title: reqStr(200),
  url: optStr(500),
  kind: z.enum(["documento", "referencia", "material", "entrega"]).default("documento"),
  rightsStatus: z.enum(["recebido", "falta", "a_produzir", "nao_autorizado"]).nullish().transform((v) => v ?? null),
  notes: optStr(1000),
});
export async function addDocument(ctx: Ctx, projectId: string, raw: z.input<typeof documentInput>) {
  assertWrite(ctx);
  assertModule(ctx, "operacao");
  await own(ctx, projectId);
  const i = parse(documentInput, raw);
  if (i.url && !/^https?:\/\//i.test(i.url)) throw new ValidationError("O link precisa começar com http:// ou https://");
  const [row] = await db.insert(crmProjectDocuments).values({ ...i, projectId }).returning();
  return row;
}
export async function deleteDocument(ctx: Ctx, projectId: string, id: string) {
  assertWrite(ctx);
  assertModule(ctx, "operacao");
  await own(ctx, projectId);
  await db.delete(crmProjectDocuments).where(and(eq(crmProjectDocuments.id, id), eq(crmProjectDocuments.projectId, projectId)));
}

export async function listProjects(ctx: Ctx, f: { status?: string; companyId?: string } = {}) {
  assertAnyModule(ctx, "operacao", "comercial", "financeiro");
  const { rows } = await db.execute<{ id: string; name: string; company_id: string; company_name: string; service_type: string | null; status: string; phase: string; due_date: string | null; open_tasks: number; done_tasks: number }>(sql`
    select p.id, p.name, p.company_id, c.name as company_name, p.service_type, p.status, p.phase, p.due_date::text as due_date,
      (select count(*)::int from crm_tasks t where t.project_id = p.id and t.status in ('pendente','em_andamento')) as open_tasks,
      (select count(*)::int from crm_tasks t where t.project_id = p.id and t.status = 'concluida') as done_tasks
    from crm_projects p join crm_companies c on c.id = p.company_id
    where p.workspace_id = ${ctx.workspaceId} ${f.status ? sql`and p.status = ${f.status}` : sql``} ${f.companyId ? sql`and p.company_id = ${f.companyId}` : sql``}
    order by (p.status in ('entregue','cancelado')), p.due_date nulls last, p.created_at desc`);
  return rows.map((r) => ({ id: r.id, name: r.name, companyId: r.company_id, companyName: r.company_name, serviceType: r.service_type, status: r.status, phase: r.phase, dueDate: r.due_date, openTasks: r.open_tasks, doneTasks: r.done_tasks }));
}

export async function getProject(ctx: Ctx, id: string) {
  assertModule(ctx, "operacao");
  const project = await own(ctx, id);
  const [company] = await db.select().from(crmCompanies).where(eq(crmCompanies.id, project.companyId));
  const [documents, timeline, dealRow, proposalRow] = await Promise.all([
    db.select().from(crmProjectDocuments).where(eq(crmProjectDocuments.projectId, id)).orderBy(desc(crmProjectDocuments.createdAt)),
    timelineFor(ctx, { projectId: id }, 80),
    project.dealId ? db.select({ id: crmDeals.id, title: crmDeals.title }).from(crmDeals).where(eq(crmDeals.id, project.dealId)) : Promise.resolve([]),
    project.proposalId ? db.select({ id: crmProposals.id, title: crmProposals.title, version: crmProposals.version }).from(crmProposals).where(eq(crmProposals.id, project.proposalId)) : Promise.resolve([]),
  ]);
  return { project, company, documents, timeline, deal: dealRow[0] ?? null, proposal: proposalRow[0] ?? null };
}

/** Resumo para o MCP (get_project_briefing) e para exportar o pacote ao Claude Code. */
export async function projectBriefing(ctx: Ctx, id: string) {
  const { project, company, documents } = await getProject(ctx, id);
  return {
    id: project.id, nome: project.name, cliente: company?.name, servico: project.serviceType, escopo: project.scope, status: project.status, fase: project.phase, prazo: project.dueDate,
    secoes: project.sections, links: project.links, documentos: documents.map((d) => ({ titulo: d.title, url: d.url, tipo: d.kind, direitos: d.rightsStatus })),
  };
}
