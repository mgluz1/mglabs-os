import "server-only";

import { sql } from "drizzle-orm";

import { addDays } from "@/lib/dates";
import { db } from "@/lib/db";
import type { Ctx } from "@/lib/services/ctx";

/**
 * Relatórios (SQL puro, sem IA). Cada bloco diz de onde vem o número:
 *  - origens: oportunidades criadas no período, por origem;
 *  - etapas: distribuição ATUAL dos negócios (não é conversão histórica);
 *  - perdas: motivos informados ao mover para Perdido;
 *  - ticket médio / tempo de fechamento: só negócios ganhos com valor / datas registradas.
 */
export async function reportsData(ctx: Ctx, periodDays = 90) {
  const since = addDays(new Date(), -periodDays);
  const ws = ctx.workspaceId;
  const [bySource, byStage, lost, won, received] = await Promise.all([
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
    db.execute<{ ym: string; total: string }>(sql`
      select to_char(paid_at, 'YYYY-MM') as ym, sum(amount_cents)::text as total from crm_payments where workspace_id = ${ws} and paid_at >= ${since.toISOString().slice(0, 10)}::date group by 1 order by 1`),
  ]);
  const closed = byStage.rows.filter((s) => s.kind !== "open").reduce((a, s) => a + s.n, 0);
  const wonN = byStage.rows.filter((s) => s.kind === "won").reduce((a, s) => a + s.n, 0);
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
  };
}
