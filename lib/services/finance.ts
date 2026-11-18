import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { crmCompanies, crmPayments, crmReceivables } from "@/db/schema";
import { addMonthsYmd, ymdSP } from "@/lib/dates";
import { db } from "@/lib/db";
import { receivableState, splitInstallments, type ReceivableState } from "@/lib/money";
import { logActivity } from "@/lib/services/activities";
import { assertModule, assertWrite, audit, NotFoundError, ValidationError, type Ctx } from "@/lib/services/ctx";
import { optStr, parse, reqStr } from "@/lib/services/util";

export const receivableInput = z.object({
  companyId: z.string().uuid(),
  projectId: z.string().uuid().nullish().transform((v) => v ?? null),
  dealId: z.string().uuid().nullish().transform((v) => v ?? null),
  proposalId: z.string().uuid().nullish().transform((v) => v ?? null),
  description: reqStr(300),
  amountCents: z.number().int().min(1, "Informe um valor maior que zero").max(1_000_000_000_00),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  /** Parcelas mensais a partir do vencimento (1 = valor único). */
  installments: z.number().int().min(1).max(60).default(1),
  notes: optStr(1000),
});
export type ReceivableInput = z.input<typeof receivableInput>;

/** Cria 1..n parcelas (centavos sem perda). Retorna as linhas criadas. */
export async function createReceivables(ctx: Ctx, raw: ReceivableInput) {
  assertWrite(ctx);
  assertModule(ctx, "financeiro");
  const i = parse(receivableInput, raw);
  const [co] = await db.select({ id: crmCompanies.id }).from(crmCompanies).where(and(eq(crmCompanies.id, i.companyId), eq(crmCompanies.workspaceId, ctx.workspaceId)));
  if (!co) throw new NotFoundError("Empresa");
  const parts = splitInstallments(i.amountCents, i.installments);
  const rows = await db
    .insert(crmReceivables)
    .values(
      parts.map((amountCents, n) => ({
        workspaceId: ctx.workspaceId, companyId: i.companyId, projectId: i.projectId, dealId: i.dealId, proposalId: i.proposalId,
        description: parts.length > 1 ? `${i.description} (${n + 1}/${parts.length})` : i.description,
        amountCents, dueDate: addMonthsYmd(i.dueDate, n), installmentNo: n + 1, installmentsTotal: parts.length, notes: i.notes,
      })),
    )
    .returning();
  await logActivity(ctx, { companyId: i.companyId, dealId: i.dealId, kind: "pagamento", content: `Cobrança prevista: ${i.description}`, meta: { receivableIds: rows.map((r) => r.id) } });
  await audit(ctx, "create", "receivable", rows[0]?.id);
  return rows;
}

export const paymentInput = z.object({
  receivableId: z.string().uuid(),
  amountCents: z.number().int().min(1, "Informe um valor maior que zero"),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  method: z.enum(["pix", "boleto", "cartao", "transferencia", "dinheiro", "outro"]).nullish().transform((v) => v ?? null),
  notes: optStr(500),
});
export type PaymentInput = z.input<typeof paymentInput>;

/** Registro manual de recebimento. Não permite pagar mais que o saldo (evita receita inflada). */
export async function registerPayment(ctx: Ctx, raw: PaymentInput) {
  assertWrite(ctx);
  assertModule(ctx, "financeiro");
  const i = parse(paymentInput, raw);
  const [rec] = await db.select().from(crmReceivables).where(and(eq(crmReceivables.id, i.receivableId), eq(crmReceivables.workspaceId, ctx.workspaceId)));
  if (!rec) throw new NotFoundError("Cobrança");
  if (rec.status === "cancelada") throw new ValidationError("Esta cobrança foi cancelada.");
  const [{ paid }] = await db.select({ paid: sql<string>`coalesce(sum(${crmPayments.amountCents}),0)::text` }).from(crmPayments).where(eq(crmPayments.receivableId, rec.id));
  const balance = rec.amountCents - Number(paid);
  if (i.amountCents > balance) throw new ValidationError("O valor excede o saldo em aberto desta cobrança.");
  const [row] = await db.insert(crmPayments).values({ ...i, workspaceId: ctx.workspaceId, createdBy: ctx.userId }).returning();
  await logActivity(ctx, { companyId: rec.companyId, dealId: rec.dealId, kind: "pagamento", content: `Pagamento registrado: ${rec.description}`, meta: { paymentId: row.id, amountCents: i.amountCents } });
  await audit(ctx, "create", "payment", row.id, { amountCents: i.amountCents });
  return row;
}

export async function deletePayment(ctx: Ctx, id: string) {
  assertWrite(ctx);
  assertModule(ctx, "financeiro");
  await db.delete(crmPayments).where(and(eq(crmPayments.id, id), eq(crmPayments.workspaceId, ctx.workspaceId)));
  await audit(ctx, "delete", "payment", id);
}

export async function cancelReceivable(ctx: Ctx, id: string) {
  assertWrite(ctx);
  assertModule(ctx, "financeiro");
  await db.update(crmReceivables).set({ status: "cancelada", updatedAt: new Date() }).where(and(eq(crmReceivables.id, id), eq(crmReceivables.workspaceId, ctx.workspaceId)));
  await audit(ctx, "cancel", "receivable", id);
}

export type ReceivableItem = {
  id: string;
  companyId: string;
  companyName: string;
  projectId: string | null;
  projectName: string | null;
  description: string;
  amountCents: number;
  paidCents: number;
  dueDate: string;
  state: ReceivableState;
  installmentNo: number;
  installmentsTotal: number;
  payments: { id: string; amountCents: number; paidAt: string; method: string | null }[];
};

export async function listReceivables(ctx: Ctx, f: { state?: ReceivableState; companyId?: string; projectId?: string; limit?: number } = {}): Promise<ReceivableItem[]> {
  assertModule(ctx, "financeiro");
  const { rows } = await db.execute<{ id: string; company_id: string; company_name: string; project_id: string | null; project_name: string | null; description: string; amount: string; due_date: string; status: string; installment_no: number; installments_total: number; paid: string; payments: { id: string; amountCents: number; paidAt: string; method: string | null }[] }>(sql`
    select r.id, r.company_id, c.name as company_name, r.project_id, p.name as project_name, r.description, r.amount_cents::text as amount, r.due_date::text as due_date, r.status,
           r.installment_no, r.installments_total,
           coalesce((select sum(x.amount_cents) from crm_payments x where x.receivable_id = r.id),0)::text as paid,
           coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'amountCents', x.amount_cents, 'paidAt', x.paid_at::text, 'method', x.method) order by x.paid_at) from crm_payments x where x.receivable_id = r.id), '[]'::jsonb) as payments
    from crm_receivables r join crm_companies c on c.id = r.company_id left join crm_projects p on p.id = r.project_id
    where r.workspace_id = ${ctx.workspaceId}
      ${f.companyId ? sql`and r.company_id = ${f.companyId}` : sql``}
      ${f.projectId ? sql`and r.project_id = ${f.projectId}` : sql``}
    order by r.due_date asc, r.installment_no limit ${Math.min(f.limit ?? 300, 500)}`);
  const today = ymdSP();
  const items = rows.map((r) => {
    const amountCents = Number(r.amount);
    const paidCents = Number(r.paid);
    return { id: r.id, companyId: r.company_id, companyName: r.company_name, projectId: r.project_id, projectName: r.project_name, description: r.description, amountCents, paidCents, dueDate: r.due_date, state: receivableState({ status: r.status, amountCents, paidCents, dueDate: r.due_date }, today), installmentNo: r.installment_no, installmentsTotal: r.installments_total, payments: r.payments };
  });
  return f.state ? items.filter((i) => i.state === f.state) : items;
}

/**
 * Quatro números que nunca se misturam:
 * pipeline (previsto/ponderado) · contratado (ganhos) · a receber (cobranças em aberto) · recebido (pagamentos).
 */
export async function financeSummary(ctx: Ctx, opts: { months?: number } = {}) {
  assertModule(ctx, "financeiro");
  const months = Math.min(opts.months ?? 6, 24);
  const today = ymdSP();
  const monthStart = today.slice(0, 7) + "-01";
  const [pipe, contracted, recv, received, monthly, byClient] = await Promise.all([
    db.execute<{ open: string; weighted: string }>(sql`
      select coalesce(sum(d.estimated_value_cents),0)::text as open,
             coalesce(sum(d.estimated_value_cents * coalesce(d.probability, s.probability) / 100.0),0)::numeric(20,0)::text as weighted
      from crm_deals d join crm_stages s on s.id = d.stage_id where d.workspace_id = ${ctx.workspaceId} and s.kind = 'open'`),
    db.execute<{ total: string; n: number }>(sql`
      select coalesce(sum(coalesce((select p.total_cents from crm_proposals p where p.deal_id = d.id and p.status = 'aprovada' order by p.decided_at desc limit 1), d.estimated_value_cents)),0)::text as total, count(*)::int as n
      from crm_deals d join crm_stages s on s.id = d.stage_id where d.workspace_id = ${ctx.workspaceId} and s.kind = 'won'`),
    db.execute<{ billed: string; paid: string; overdue: string }>(sql`
      select coalesce(sum(r.amount_cents),0)::text as billed,
             coalesce(sum(least(r.amount_cents, pp.paid)),0)::text as paid,
             coalesce(sum(case when r.due_date < ${today}::date then r.amount_cents - least(r.amount_cents, pp.paid) else 0 end),0)::text as overdue
      from crm_receivables r
      cross join lateral (select coalesce(sum(x.amount_cents),0) as paid from crm_payments x where x.receivable_id = r.id) pp
      where r.workspace_id = ${ctx.workspaceId} and r.status <> 'cancelada'`),
    db.execute<{ total: string; month: string }>(sql`
      select coalesce(sum(x.amount_cents),0)::text as total,
             coalesce(sum(x.amount_cents) filter (where x.paid_at >= ${monthStart}::date),0)::text as month
      from crm_payments x join crm_receivables r on r.id = x.receivable_id where x.workspace_id = ${ctx.workspaceId} and r.status <> 'cancelada'`),
    db.execute<{ ym: string; received: string }>(sql`
      select to_char(x.paid_at, 'YYYY-MM') as ym, sum(x.amount_cents)::text as received
      from crm_payments x where x.workspace_id = ${ctx.workspaceId} and x.paid_at >= (${monthStart}::date - (${months - 1} || ' months')::interval)
      group by 1 order by 1`),
    db.execute<{ company_id: string; name: string; received: string }>(sql`
      select c.id as company_id, c.name, sum(x.amount_cents)::text as received
      from crm_payments x join crm_receivables r on r.id = x.receivable_id join crm_companies c on c.id = r.company_id
      where x.workspace_id = ${ctx.workspaceId} group by c.id, c.name order by sum(x.amount_cents) desc limit 8`),
  ]);
  const billed = Number(recv.rows[0].billed);
  const paidOnBilled = Number(recv.rows[0].paid);
  return {
    pipelineCents: Number(pipe.rows[0].open),
    pipelineWeightedCents: Number(pipe.rows[0].weighted),
    contractedCents: Number(contracted.rows[0].total),
    wonCount: contracted.rows[0].n,
    billedCents: billed,
    toReceiveCents: billed - paidOnBilled,
    overdueCents: Number(recv.rows[0].overdue),
    receivedCents: Number(received.rows[0].total),
    receivedThisMonthCents: Number(received.rows[0].month),
    monthly: monthly.rows.map((m) => ({ ym: m.ym, receivedCents: Number(m.received) })),
    byClient: byClient.rows.map((c) => ({ companyId: c.company_id, name: c.name, receivedCents: Number(c.received) })),
  };
}

