import "server-only";

import { eq, sql } from "drizzle-orm";

import { crmActivities, crmContacts, crmDeals } from "@/db/schema";
import { db } from "@/lib/db";
import type { Ctx } from "@/lib/services/ctx";

export type ActivityInput = {
  dealId?: string | null;
  companyId?: string | null;
  contactId?: string | null;
  projectId?: string | null;
  kind: string;
  channel?: string | null;
  content?: string | null;
  meta?: Record<string, unknown> | null;
  occurredAt?: Date;
};

const CONTACT_KINDS = new Set(["mensagem_enviada", "ligacao", "resposta", "reuniao"]);

/** Registra no histórico persistente (timeline) e atualiza "última interação". */
export async function logActivity(ctx: Ctx, a: ActivityInput) {
  const occurredAt = a.occurredAt ?? new Date();
  const [row] = await db
    .insert(crmActivities)
    .values({
      workspaceId: ctx.workspaceId,
      dealId: a.dealId ?? null,
      companyId: a.companyId ?? null,
      contactId: a.contactId ?? null,
      projectId: a.projectId ?? null,
      kind: a.kind,
      channel: a.channel ?? null,
      content: a.content?.slice(0, 4000) ?? null,
      meta: a.meta ?? null,
      authorId: ctx.userId,
      authorKind: ctx.actor,
      occurredAt,
    })
    .returning();
  if (a.dealId) await db.update(crmDeals).set({ lastActivityAt: occurredAt }).where(eq(crmDeals.id, a.dealId));
  if (a.contactId && CONTACT_KINDS.has(a.kind)) await db.update(crmContacts).set({ lastContactAt: occurredAt }).where(eq(crmContacts.id, a.contactId));
  return row;
}

export type TimelineItem = {
  id: string;
  kind: string;
  channel: string | null;
  content: string | null;
  meta: Record<string, unknown> | null;
  authorKind: string;
  occurredAt: Date;
  dealTitle: string | null;
};

export async function timelineFor(ctx: Ctx, where: { dealId?: string; companyId?: string; projectId?: string }, limit = 100): Promise<TimelineItem[]> {
  const cond = where.dealId ? sql`a.deal_id = ${where.dealId}` : where.projectId ? sql`a.project_id = ${where.projectId}` : sql`a.company_id = ${where.companyId ?? null}`;
  const { rows } = await db.execute<{ id: string; kind: string; channel: string | null; content: string | null; meta: Record<string, unknown> | null; author_kind: string; occurred_at: string; deal_title: string | null }>(sql`
    select a.id, a.kind, a.channel, a.content, a.meta, a.author_kind, a.occurred_at, d.title as deal_title
    from crm_activities a left join crm_deals d on d.id = a.deal_id
    where a.workspace_id = ${ctx.workspaceId} and ${cond}
    order by a.occurred_at desc limit ${limit}`);
  return rows.map((r) => ({ id: r.id, kind: r.kind, channel: r.channel, content: r.content, meta: r.meta, authorKind: r.author_kind, occurredAt: new Date(r.occurred_at), dealTitle: r.deal_title }));
}

export async function recentActivities(ctx: Ctx, limit = 10) {
  const { rows } = await db.execute<{ id: string; kind: string; content: string | null; occurred_at: string; company_name: string | null; company_id: string | null; deal_id: string | null; deal_title: string | null }>(sql`
    select a.id, a.kind, a.content, a.occurred_at, c.name as company_name, a.company_id, a.deal_id, d.title as deal_title
    from crm_activities a left join crm_companies c on c.id = a.company_id left join crm_deals d on d.id = a.deal_id
    where a.workspace_id = ${ctx.workspaceId}
    order by a.occurred_at desc limit ${limit}`);
  return rows.map((r) => ({ id: r.id, kind: r.kind, content: r.content, occurredAt: new Date(r.occurred_at), companyName: r.company_name, companyId: r.company_id, dealId: r.deal_id, dealTitle: r.deal_title }));
}
