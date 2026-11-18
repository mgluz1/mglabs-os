import "server-only";

import { sql } from "drizzle-orm";

import { addDays, endOfDaySP, startOfDaySP } from "@/lib/dates";
import { db } from "@/lib/db";
import { recentActivities } from "@/lib/services/activities";
import { canModule, type Ctx } from "@/lib/services/ctx";
import { financeSummary } from "@/lib/services/finance";

/**
 * Cada número vem de uma consulta SQL (nunca de estimativa da IA):
 *  - leads: empresas com status "lead" ainda sem negócio fechado;
 *  - oportunidades ativas / valor do funil: negócios em etapas "open" (soma dos valores previstos);
 *  - fechados: negócios em etapa "won" (no período, por won_at);
 *  - tarefas pendentes: status pendente/em andamento;
 *  - recebido: soma de pagamentos registrados (crm_payments), nunca de previsões.
 */
export async function dashboardData(ctx: Ctx, periodDays = 30) {
  const since = addDays(new Date(), -periodDays);
  const sod = startOfDaySP();
  const eod = endOfDaySP();
  const [counts, funnel, followups, recent, finance] = await Promise.all([
    db.execute<{ leads: number; new_leads: number; open_deals: number; pipeline: string; weighted: string; won_total: number; won_period: number; won_value_period: string; lost_period: number; open_tasks: number; overdue_tasks: number; today_tasks: number; companies: number; projects_active: number }>(sql`
      select
        (select count(*)::int from crm_companies where workspace_id = ${ctx.workspaceId} and archived_at is null and status = 'lead') as leads,
        (select count(*)::int from crm_companies where workspace_id = ${ctx.workspaceId} and archived_at is null and created_at >= ${since}) as new_leads,
        (select count(*)::int from crm_deals d join crm_stages s on s.id = d.stage_id where d.workspace_id = ${ctx.workspaceId} and s.kind = 'open') as open_deals,
        (select coalesce(sum(d.estimated_value_cents),0)::text from crm_deals d join crm_stages s on s.id = d.stage_id where d.workspace_id = ${ctx.workspaceId} and s.kind = 'open') as pipeline,
        (select coalesce(sum(d.estimated_value_cents * coalesce(d.probability, s.probability) / 100.0),0)::numeric(20,0)::text from crm_deals d join crm_stages s on s.id = d.stage_id where d.workspace_id = ${ctx.workspaceId} and s.kind = 'open') as weighted,
        (select count(*)::int from crm_deals d join crm_stages s on s.id = d.stage_id where d.workspace_id = ${ctx.workspaceId} and s.kind = 'won') as won_total,
        (select count(*)::int from crm_deals d join crm_stages s on s.id = d.stage_id where d.workspace_id = ${ctx.workspaceId} and s.kind = 'won' and d.won_at >= ${since}) as won_period,
        (select coalesce(sum(d.estimated_value_cents),0)::text from crm_deals d join crm_stages s on s.id = d.stage_id where d.workspace_id = ${ctx.workspaceId} and s.kind = 'won' and d.won_at >= ${since}) as won_value_period,
        (select count(*)::int from crm_deals d join crm_stages s on s.id = d.stage_id where d.workspace_id = ${ctx.workspaceId} and s.kind = 'lost' and d.lost_at >= ${since}) as lost_period,
        (select count(*)::int from crm_tasks where workspace_id = ${ctx.workspaceId} and status in ('pendente','em_andamento')) as open_tasks,
        (select count(*)::int from crm_tasks where workspace_id = ${ctx.workspaceId} and status in ('pendente','em_andamento') and due_at < ${sod}) as overdue_tasks,
        (select count(*)::int from crm_tasks where workspace_id = ${ctx.workspaceId} and status in ('pendente','em_andamento') and due_at between ${sod} and ${eod}) as today_tasks,
        (select count(*)::int from crm_companies where workspace_id = ${ctx.workspaceId} and archived_at is null) as companies,
        (select count(*)::int from crm_projects where workspace_id = ${ctx.workspaceId} and status in ('planejado','em_andamento','em_revisao')) as projects_active`),
    db.execute<{ key: string; label: string; position: number; kind: string; n: number; value: string }>(sql`
      select s.key, s.label, s.position, s.kind, count(d.id)::int as n, coalesce(sum(d.estimated_value_cents),0)::text as value
      from crm_stages s left join crm_deals d on d.stage_id = s.id
      where s.workspace_id = ${ctx.workspaceId} group by s.id order by s.position`),
    db.execute<{ kind: "tarefa" | "negocio"; id: string; title: string; company_name: string | null; due_at: string; deal_id: string | null }>(sql`
      (select 'tarefa' as kind, t.id, t.title, c.name as company_name, t.due_at, t.deal_id from crm_tasks t
         left join crm_deals d on d.id = t.deal_id left join crm_companies c on c.id = coalesce(t.company_id, d.company_id)
         where t.workspace_id = ${ctx.workspaceId} and t.status in ('pendente','em_andamento') and t.due_at is not null and t.due_at <= ${addDays(eod, 7)} order by t.due_at limit 8)
      union all
      (select 'negocio', d.id, coalesce(d.next_step, d.title), c.name, d.next_step_at, d.id from crm_deals d join crm_stages s on s.id = d.stage_id join crm_companies c on c.id = d.company_id
         where d.workspace_id = ${ctx.workspaceId} and s.kind = 'open' and d.next_step_at is not null and d.next_step_at <= ${addDays(eod, 7)} order by d.next_step_at limit 8)
      order by due_at limit 10`),
    recentActivities(ctx, 8),
    canModule(ctx, "financeiro") ? financeSummary(ctx) : Promise.resolve(null),
  ]);
  const c = counts.rows[0];
  const received = finance
    ? await db.execute<{ total: string }>(sql`select coalesce(sum(amount_cents),0)::text as total from crm_payments where workspace_id = ${ctx.workspaceId} and paid_at >= ${since.toISOString().slice(0, 10)}::date`)
    : null;
  return {
    periodDays,
    leads: c.leads,
    newLeads: c.new_leads,
    openDeals: c.open_deals,
    pipelineCents: Number(c.pipeline),
    weightedCents: Number(c.weighted),
    wonTotal: c.won_total,
    wonPeriod: c.won_period,
    wonValuePeriodCents: Number(c.won_value_period),
    lostPeriod: c.lost_period,
    openTasks: c.open_tasks,
    overdueTasks: c.overdue_tasks,
    todayTasks: c.today_tasks,
    companies: c.companies,
    projectsActive: c.projects_active,
    funnel: funnel.rows.map((f) => ({ key: f.key, label: f.label, kind: f.kind, count: f.n, valueCents: Number(f.value) })),
    followups: followups.rows.map((f) => ({ kind: f.kind, id: f.id, title: f.title, companyName: f.company_name, dueAt: new Date(f.due_at), dealId: f.deal_id, overdue: new Date(f.due_at).getTime() < Date.now() })),
    recent,
    finance: finance ? { ...finance, receivedPeriodCents: Number(received?.rows[0].total ?? 0) } : null,
  };
}
export type DashboardData = Awaited<ReturnType<typeof dashboardData>>;
