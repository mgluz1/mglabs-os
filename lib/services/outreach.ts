import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { parseBrPhone } from "@/lib/phone";
import { planMessage, queueRank, type MessagePlan } from "@/lib/message-plan";
import { assertModule, type Ctx } from "@/lib/services/ctx";
import type { ObjectiveId } from "@/lib/config/crm";

export type QueueItem = {
  dealId: string;
  companyId: string;
  companyName: string;
  category: string | null;
  city: string | null;
  stageKey: string;
  stageLabel: string;
  score: number | null;
  contactName: string | null;
  objective: ObjectiveId;
  reason: string;
  awaitingReply: boolean;
  waitingDays: number | null;
  priority: number;
};

type Row = {
  deal_id: string;
  company_id: string;
  company_name: string;
  category: string | null;
  city: string | null;
  place_id: string | null;
  stage_key: string;
  stage_label: string;
  score: number | null;
  contact_name: string | null;
  contact_id: string | null;
  phones: (string | null)[];
  has_other: boolean;
  last_sent: Date | string | null;
  last_reply: Date | string | null;
  contact_opted_out: boolean;
  next_step_at: Date | string | null;
};

/**
 * Fila de abordagem: negócios abertos que pedem uma mensagem agora, em ordem de urgência.
 * Cliente que respondeu > follow-ups vencidos > ainda não abordados (por nota do Radar).
 * Fora da fila: opt-out, negócio sem nenhum meio de contato e quem recebeu mensagem há pouco tempo.
 */
export async function outreachQueue(ctx: Ctx, opts: { limit?: number; followUpAfterDays?: number; now?: Date } = {}): Promise<QueueItem[]> {
  assertModule(ctx, "comercial");
  const now = opts.now ?? new Date();
  const { rows } = await db.execute<Row>(sql`
    select d.id as deal_id, c.id as company_id, c.name as company_name, c.category, c.city, c.place_id,
           s.key as stage_key, s.label as stage_label,
           ls.total as score,
           k.name as contact_name, k.id as contact_id,
           array[k.whatsapp, k.phone, c.phone] as phones,
           (coalesce(k.email, c.email, k.instagram, c.instagram) is not null) as has_other,
           (select max(a.occurred_at) from crm_activities a where a.workspace_id = d.workspace_id and a.kind = 'mensagem_enviada' and (a.deal_id = d.id or a.company_id = c.id)) as last_sent,
           (select max(a.occurred_at) from crm_activities a where a.workspace_id = d.workspace_id and a.kind = 'resposta' and (a.deal_id = d.id or a.company_id = c.id)) as last_reply,
           coalesce(k.opted_out, false) as contact_opted_out,
           d.next_step_at
    from crm_deals d
    join crm_stages s on s.id = d.stage_id and s.kind = 'open'
    join crm_companies c on c.id = d.company_id
    left join crm_contacts k on k.id = d.primary_contact_id
    left join lead_scores ls on ls.place_id = c.place_id
    where d.workspace_id = ${ctx.workspaceId} and c.status <> 'inativo'
    order by coalesce(ls.total, 0) desc, d.created_at desc
    limit 300
  `);
  if (!rows.length) return [];

  // opt-out em lote: lista global por telefone/lugar + contatos marcados
  const e164 = (list: (string | null)[]) => list.map((p) => parseBrPhone(p)?.e164).filter((x): x is string => !!x);
  const allNums = [...new Set(rows.flatMap((r) => e164(r.phones)))];
  const placeIds = [...new Set(rows.map((r) => r.place_id).filter((x): x is string => !!x))];
  const blockedNums = new Set<string>();
  const blockedPlaces = new Set<string>();
  if (allNums.length) {
    const { rows: hit } = await db.execute<{ phone: string }>(sql`select phone from optouts where phone in (${sql.join(allNums.map((n) => sql`${n}`), sql`, `)})`);
    for (const h of hit) blockedNums.add(h.phone);
    const { rows: ck } = await db.execute<{ n: string }>(sql`
      select unnest(array[phone, whatsapp]) as n from crm_contacts
      where workspace_id = ${ctx.workspaceId} and opted_out = true and (phone in (${sql.join(allNums.map((n) => sql`${n}`), sql`, `)}) or whatsapp in (${sql.join(allNums.map((n) => sql`${n}`), sql`, `)}))`);
    for (const h of ck) {
      const e = parseBrPhone(h.n)?.e164;
      if (e) blockedNums.add(e);
    }
  }
  if (placeIds.length) {
    const { rows: hit } = await db.execute<{ id: string }>(sql`
      select p.id from places p join optouts o on (o.overture_id is not null and o.overture_id = p.overture_id) or (o.google_place_id is not null and o.google_place_id = p.google_place_id)
      where p.id in (${sql.join(placeIds.map((n) => sql`${n}::uuid`), sql`, `)})`);
    for (const h of hit) blockedPlaces.add(h.id);
  }

  const items: (QueueItem & { rank: number })[] = [];
  for (const r of rows) {
    if (r.contact_opted_out) continue;
    const nums = e164(r.phones);
    if (nums.some((n) => blockedNums.has(n)) || (r.place_id && blockedPlaces.has(r.place_id))) continue;
    if (!nums.length && !r.has_other) continue; // sem nenhum meio de contato
    const history = [
      r.last_sent ? { kind: "mensagem_enviada", occurredAt: r.last_sent } : null,
      r.last_reply ? { kind: "resposta", occurredAt: r.last_reply } : null,
    ].filter((x): x is { kind: string; occurredAt: Date | string } => !!x);
    const plan: MessagePlan = planMessage({ stageKey: r.stage_key, history, now, followUpAfterDays: opts.followUpAfterDays });
    if (plan.priority >= 3) continue; // enviado há pouco: ainda não é hora
    items.push({
      dealId: r.deal_id,
      companyId: r.company_id,
      companyName: r.company_name,
      category: r.category,
      city: r.city,
      stageKey: r.stage_key,
      stageLabel: r.stage_label,
      score: r.score,
      contactName: r.contact_name,
      objective: plan.objective,
      reason: plan.reason,
      awaitingReply: plan.awaitingReply,
      waitingDays: plan.waitingDays,
      priority: plan.priority,
      rank: queueRank(plan, r.score),
    });
  }
  items.sort((a, b) => a.rank - b.rank);
  return items.slice(0, opts.limit ?? 40).map((it) => {
    const out: QueueItem & { rank?: number } = { ...it };
    delete out.rank;
    return out;
  });
}
