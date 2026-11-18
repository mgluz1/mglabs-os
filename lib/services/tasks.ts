import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { crmTasks } from "@/db/schema";
import { addDays, endOfDaySP, startOfDaySP } from "@/lib/dates";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/services/activities";
import { assertWrite, audit, NotFoundError, type Ctx } from "@/lib/services/ctx";
import { instant, limitOf, optStr, parse, reqStr } from "@/lib/services/util";

export const taskInput = z.object({
  title: reqStr(200),
  description: optStr(2000),
  priority: z.enum(["baixa", "media", "alta", "urgente"]).default("media"),
  dueAt: instant,
  dealId: z.string().uuid().nullish().transform((v) => v ?? null),
  companyId: z.string().uuid().nullish().transform((v) => v ?? null),
  projectId: z.string().uuid().nullish().transform((v) => v ?? null),
  assignedTo: optStr(100),
  source: z.enum(["manual", "ia", "mcp", "automacao"]).default("manual"),
  /** Para automações/cadências: a mesma chave nunca cria duas tarefas. */
  dedupeKey: optStr(200),
});
export type TaskInput = z.input<typeof taskInput>;

export type TaskView = "hoje" | "atrasadas" | "semana" | "abertas" | "sem_data" | "concluidas";

export type TaskItem = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  dueAt: Date | null;
  completedAt: Date | null;
  dealId: string | null;
  dealTitle: string | null;
  companyId: string | null;
  companyName: string | null;
  projectId: string | null;
  projectName: string | null;
  source: string;
};

export async function listTasks(ctx: Ctx, f: { view?: TaskView; dealId?: string; companyId?: string; projectId?: string; limit?: number } = {}): Promise<TaskItem[]> {
  const now = new Date();
  const sod = startOfDaySP(now);
  const eod = endOfDaySP(now);
  const view = f.view ?? "abertas";
  const open = sql`t.status in ('pendente','em_andamento')`;
  const cond =
    view === "hoje" ? sql`${open} and t.due_at >= ${sod} and t.due_at <= ${eod}`
    : view === "atrasadas" ? sql`${open} and t.due_at < ${sod}`
    : view === "semana" ? sql`${open} and t.due_at > ${eod} and t.due_at <= ${addDays(eod, 7)}`
    : view === "sem_data" ? sql`${open} and t.due_at is null`
    : view === "concluidas" ? sql`t.status = 'concluida'`
    : open;
  const { rows } = await db.execute<{ id: string; title: string; description: string | null; priority: string; status: string; due_at: string | null; completed_at: string | null; deal_id: string | null; deal_title: string | null; company_id: string | null; company_name: string | null; project_id: string | null; project_name: string | null; source: string }>(sql`
    select t.id, t.title, t.description, t.priority, t.status, t.due_at, t.completed_at, t.deal_id, d.title as deal_title,
           coalesce(t.company_id, d.company_id) as company_id, coalesce(c.name, dc.name) as company_name, t.project_id, p.name as project_name, t.source
    from crm_tasks t
    left join crm_deals d on d.id = t.deal_id
    left join crm_companies c on c.id = t.company_id
    left join crm_companies dc on dc.id = d.company_id
    left join crm_projects p on p.id = t.project_id
    where t.workspace_id = ${ctx.workspaceId} and ${cond}
      ${f.dealId ? sql`and t.deal_id = ${f.dealId}` : sql``}
      ${f.companyId ? sql`and (t.company_id = ${f.companyId} or d.company_id = ${f.companyId})` : sql``}
      ${f.projectId ? sql`and t.project_id = ${f.projectId}` : sql``}
    order by ${view === "concluidas" ? sql`t.completed_at desc nulls last` : sql`t.due_at asc nulls last, case t.priority when 'urgente' then 0 when 'alta' then 1 when 'media' then 2 else 3 end`}
    limit ${limitOf(f.limit, 100, 300)}`);
  return rows.map((r) => ({
    id: r.id, title: r.title, description: r.description, priority: r.priority, status: r.status,
    dueAt: r.due_at ? new Date(r.due_at) : null, completedAt: r.completed_at ? new Date(r.completed_at) : null,
    dealId: r.deal_id, dealTitle: r.deal_title, companyId: r.company_id, companyName: r.company_name,
    projectId: r.project_id, projectName: r.project_name, source: r.source,
  }));
}

export async function taskCounts(ctx: Ctx) {
  const now = new Date();
  const sod = startOfDaySP(now);
  const eod = endOfDaySP(now);
  const { rows } = await db.execute<{ hoje: number; atrasadas: number; abertas: number; semana: number; sem_data: number }>(sql`
    select count(*) filter (where status in ('pendente','em_andamento') and due_at between ${sod} and ${eod})::int as hoje,
           count(*) filter (where status in ('pendente','em_andamento') and due_at < ${sod})::int as atrasadas,
           count(*) filter (where status in ('pendente','em_andamento'))::int as abertas,
           count(*) filter (where status in ('pendente','em_andamento') and due_at > ${eod} and due_at <= ${addDays(eod, 7)})::int as semana,
           count(*) filter (where status in ('pendente','em_andamento') and due_at is null)::int as sem_data
    from crm_tasks where workspace_id = ${ctx.workspaceId}`);
  return rows[0];
}

/** Retorna null se a chave de deduplicação já existia (idempotente para automações). */
export async function createTask(ctx: Ctx, raw: TaskInput) {
  assertWrite(ctx);
  const i = parse(taskInput, raw);
  const [row] = await db
    .insert(crmTasks)
    .values({ ...i, workspaceId: ctx.workspaceId, createdBy: ctx.userId, source: ctx.actor === "mcp" ? "mcp" : i.source })
    .onConflictDoNothing()
    .returning();
  if (!row) return null;
  if (row.dealId || row.companyId) await logActivity(ctx, { dealId: row.dealId, companyId: row.companyId, kind: "tarefa", content: `Tarefa criada: ${row.title}`, meta: { taskId: row.id } });
  await audit(ctx, "create", "task", row.id);
  return row;
}

export async function updateTask(ctx: Ctx, id: string, raw: Partial<TaskInput> & { status?: "pendente" | "em_andamento" | "concluida" | "cancelada" }) {
  assertWrite(ctx);
  const { status, ...rest } = raw;
  const i = parse(taskInput.partial(), rest);
  const patch: Partial<typeof crmTasks.$inferInsert> = { ...i, updatedAt: new Date() };
  if (status) {
    patch.status = status;
    patch.completedAt = status === "concluida" ? new Date() : null;
  }
  for (const k of Object.keys(patch) as (keyof typeof patch)[]) if (patch[k] === undefined) delete patch[k];
  const [row] = await db.update(crmTasks).set(patch).where(and(eq(crmTasks.id, id), eq(crmTasks.workspaceId, ctx.workspaceId))).returning();
  if (!row) throw new NotFoundError("Tarefa");
  if (status === "concluida" && (row.dealId || row.companyId)) {
    await logActivity(ctx, { dealId: row.dealId, companyId: row.companyId, kind: "tarefa", content: `Tarefa concluída: ${row.title}`, meta: { taskId: row.id } });
  }
  return row;
}

export const completeTask = (ctx: Ctx, id: string) => updateTask(ctx, id, { status: "concluida" });
export const reopenTask = (ctx: Ctx, id: string) => updateTask(ctx, id, { status: "pendente" });

export async function deleteTask(ctx: Ctx, id: string) {
  assertWrite(ctx);
  await db.delete(crmTasks).where(and(eq(crmTasks.id, id), eq(crmTasks.workspaceId, ctx.workspaceId)));
  await audit(ctx, "delete", "task", id);
}
