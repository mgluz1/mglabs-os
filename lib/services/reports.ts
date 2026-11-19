import "server-only";

import { sql } from "drizzle-orm";

import { addDays } from "@/lib/dates";
import { db } from "@/lib/db";
import { assertModule, canModule, type Ctx } from "@/lib/services/ctx";

/**
 * Relatórios (SQL puro, sem IA). Cada bloco diz de onde vem o número:
 *  - origens: oportunidades criadas no período, por origem;
 *  - etapas: distribuição ATUAL dos negócios (não é conversão histórica);
 *  - perdas: motivos informados ao mover para Perdido;
 *  - ticket médio / tempo de fechamento: só negócios ganhos com valor / datas registradas.
 */
export async function reportsData(ctx: Ctx, periodDays = 90) {
  assertModule(ctx, "comercial");
  const canFin = canModule(ctx, "financeiro");
  const since = addDays(new Date(), -periodDays);
  const ws = ctx.workspaceId;
  const [bySource, byStage, lost, won, received, coverage, outreach] = await Promise.all([
    db.execute<{ source: string; n: number; won: number; value: string }>(sql`
      select d.source, count(*)::int as n, count(*) filter (where s.kind = 'won')::int as won, coalesce(sum(d.estimated_value_cents),0)::text as value
      from crm_deals d join crm_stages s on s.id = d.stage_id where d.workspace_id = ${ws} and d.created_at >= ${since} group by d.source order by n desc`),
    db.execute<{ label: string; kind: string; n: number; value: string }>(sql`
      select s.label, s.kind, count(d.id)::int as n, coalesce(sum(d.estimated_value_cents),0)::text as value
      from crm_stages s left join crm_deals d on d.stage_id = s.id and d.created_at >= ${since} where s.workspace_id = ${ws} group by s.id order by s.position`),
    db.execute<{ reason: string; n: number; value: string }>(sql`
      select coalesce(d.lost_reason, 'Sem motivo informado') as reason, count(*)::int as n, coalesce(sum(d.estimated_value_cents),0)::text as value
      from crm_deals d join crm_stages s on s.id = d.stage_id where d.workspace_id = ${ws} and s.kind = 'lost' and d.lost_at >= ${since} group by 1 order by n desc`),
    db.execute<{ n: number; avg_ticket: string | null; avg_days: string | null }>(sql`
      select count(*)::int as n, avg(d.estimated_value_cents)::numeric(20,0)::text as avg_ticket,
             avg(extract(epoch from (d.won_at - d.created_at)) / 86400)::numeric(10,1)::text as avg_days
      from crm_deals d join crm_stages s on s.id = d.stage_id where d.workspace_id = ${ws} and s.kind = 'won' and d.won_at >= ${since}`),
    canFin
      ? db.execute<{ ym: string; total: string }>(sql`
          select to_char(paid_at, 'YYYY-MM') as ym, sum(amount_cents)::text as total from crm_payments where workspace_id = ${ws} and paid_at >= ${since.toISOString().slice(0, 10)}::date group by 1 order by 1`)
      : Promise.resolve({ rows: [] as { ym: string; total: string }[] }),
    db.execute<{ total: number; with_contact: number }>(sql`
      select count(*)::int as total,
             count(*) filter (
               where c.phone is not null or c.email is not null or c.instagram is not null
                  or exists (select 1 from crm_contacts k where k.company_id = c.id and k.opted_out = false and (k.whatsapp is not null or k.phone is not null or k.email is not null or k.instagram is not null))
             )::int as with_contact
      from crm_companies c where c.workspace_id = ${ws} and c.archived_at is null`),
    db.execute<{ contacted_deals: number; sent_messages: number; replied_deals: number; proposals_sent: number; proposals_approved: number }>(sql`
      select
        (select count(distinct a.deal_id)::int from crm_activities a where a.workspace_id = ${ws} and a.kind = 'mensagem_enviada' and a.deal_id is not null and a.occurred_at >= ${since}) as contacted_deals,
        (select count(*)::int from crm_activities a where a.workspace_id = ${ws} and a.kind = 'mensagem_enviada' and a.occurred_at >= ${since}) as sent_messages,
        (select count(distinct a.deal_id)::int from crm_activities a where a.workspace_id = ${ws} and a.kind = 'resposta' and a.deal_id is not null and a.occurred_at >= ${since}) as replied_deals,
        (select count(*)::int from crm_proposals p where p.workspace_id = ${ws} and p.sent_at >= ${since}) as proposals_sent,
        (select count(*)::int from crm_proposals p where p.workspace_id = ${ws} and p.status = 'aprovada' and p.decided_at >= ${since}) as proposals_approved`),
  ]);
  const closed = byStage.rows.filter((s) => s.kind !== "open").reduce((a, s) => a + s.n, 0);
  const wonN = byStage.rows.filter((s) => s.kind === "won").reduce((a, s) => a + s.n, 0);
  const cov = coverage.rows[0] ?? { total: 0, with_contact: 0 };
  const out = outreach.rows[0] ?? { contacted_deals: 0, sent_messages: 0, replied_deals: 0, proposals_sent: 0, proposals_approved: 0 };
  return {
    periodDays,
    bySource: bySource.rows.map((r) => ({ source: r.source, count: r.n, won: r.won, valueCents: Number(r.value) })),
    byStage: byStage.rows.map((r) => ({ label: r.label, kind: r.kind, count: r.n, valueCents: Number(r.value) })),
    lost: lost.rows.map((r) => ({ reason: r.reason, count: r.n, valueCents: Number(r.value) })),
    winRate: closed ? wonN / closed : null,
    wonCount: won.rows[0].n,
    avgTicketCents: won.rows[0].avg_ticket == null ? null : Number(won.rows[0].avg_ticket),
    avgDaysToClose: won.rows[0].avg_days == null ? null : Number(won.rows[0].avg_days),
    receivedByMonth: received.rows.map((r) => ({ ym: r.ym, totalCents: Number(r.total) })),
    contactCoverage: { total: cov.total, withContact: cov.with_contact, rate: cov.total > 0 ? cov.with_contact / cov.total : null },
    outreach: {
      contactedDeals: out.contacted_deals,
      sentMessages: out.sent_messages,
      repliedDeals: out.replied_deals,
      replyRate: out.contacted_deals > 0 ? out.replied_deals / out.contacted_deals : null,
      proposalsSent: out.proposals_sent,
      proposalsApproved: out.proposals_approved,
      proposalApprovalRate: out.proposals_sent > 0 ? out.proposals_approved / out.proposals_sent : null,
    },
  };
}
