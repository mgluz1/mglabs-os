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
  const canComercial = canModule(ctx, "comercial");
  const [counts, funnel, followups, attentionRows, recent, finance] = await Promise.all([
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
    canComercial
      ? db.execute<{ reason: string; id: string; title: string; company_name: string | null; deal_id: string | null; proposal_id: string | null; days: number }>(sql`
          (select 'proposta_sem_retorno' as reason, p.id::text, p.title, c.name as company_name, p.deal_id::text, p.id::text as proposal_id,
                  greatest(1, floor(extract(epoch from (now() - p.sent_at)) / 86400))::int as days
           from crm_proposals p join crm_companies c on c.id = p.company_id
           where p.workspace_id = ${ctx.workspaceId} and p.status in ('enviada', 'visualizada') and p.sent_at <= now() - interval '3 days'
           order by p.sent_at asc limit 4)
          union all
          (select 'aguardando_resposta' as reason, d.id::text, d.title, c.name as company_name, d.id::text as deal_id, null::text as proposal_id,
                  greatest(1, floor(extract(epoch from (now() - msg.sent_at)) / 86400))::int as days
           from crm_deals d join crm_stages s on s.id = d.stage_id join crm_companies c on c.id = d.company_id
           cross join lateral (
             select max(a.occurred_at) as sent_at from crm_activities a
             where a.deal_id = d.id and a.kind = 'mensagem_enviada'
           ) msg
           where d.workspace_id = ${ctx.workspaceId} and s.kind = 'open'
             and msg.sent_at is not null and msg.sent_at <= now() - interval '2 days'
             and not exists (select 1 from crm_activities r where r.deal_id = d.id and r.kind = 'resposta' and r.occurred_at > msg.sent_at)
           order by msg.sent_at asc limit 4)
          union all
          (select 'interesse_sem_passo' as reason, d.id::text, d.title, c.name as company_name, d.id::text as deal_id, null::text as proposal_id,
                  greatest(1, floor(extract(epoch from (now() - coalesce(d.last_activity_at, d.updated_at))) / 86400))::int as days
           from crm_deals d join crm_stages s on s.id = d.stage_id join crm_companies c on c.id = d.company_id
           where d.workspace_id = ${ctx.workspaceId} and s.key = 'conversa' and d.next_step_at is null
           order by coalesce(d.last_activity_at, d.updated_at) asc limit 4)
          union all
          (select 'parada' as reason, d.id::text, d.title, c.name as company_name, d.id::text as deal_id, null::text as proposal_id,
                  greatest(1, floor(extract(epoch from (now() - coalesce(d.last_activity_at, d.updated_at))) / 86400))::int as days
           from crm_deals d join crm_stages s on s.id = d.stage_id join crm_companies c on c.id = d.company_id
           where d.workspace_id = ${ctx.workspaceId} and s.kind = 'open'
             and coalesce(d.last_activity_at, d.updated_at) <= now() - interval '7 days'
           order by coalesce(d.last_activity_at, d.updated_at) asc limit 4)
          limit 12`)
      : Promise.resolve({ rows: [] }),
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
    attentionQueue: attentionRows.rows.map((a) => ({
      reason: a.reason as "proposta_sem_retorno" | "aguardando_resposta" | "interesse_sem_passo" | "parada",
      id: a.id,
      title: a.title,
      companyName: a.company_name,
      dealId: a.deal_id,
      proposalId: a.proposal_id,
      days: a.days,
    })),
    recent,
    finance: finance ? { ...finance, receivedPeriodCents: Number(received?.rows[0].total ?? 0) } : null,
  };
}
export type DashboardData = Awaited<ReturnType<typeof dashboardData>>;
