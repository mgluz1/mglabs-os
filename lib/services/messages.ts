import "server-only";

import { and, desc, eq, or } from "drizzle-orm";
import { z } from "zod";

import { crmActivities, crmCompanies, crmContacts, crmDeals, crmMessageDrafts, crmMessageTemplates, crmStages, crmTasks } from "@/db/schema";
import { MESSAGE_OBJECTIVES, MESSAGE_TONES, SOURCES } from "@/lib/config/crm";
import { addDays } from "@/lib/dates";
import { db } from "@/lib/db";
import { COLD_OBJECTIVES, DEFAULT_SERVICE, OPT_OUT_LINE, greetingVars, renderTemplate, withOptOut, type TemplateVars } from "@/lib/messages";
import { parseBrPhone, waLink } from "@/lib/phone";
import { placeById } from "@/lib/queries";
import { signalsFor } from "@/lib/radar-signals";
import { NotFoundError, ValidationError, assertModule, assertWrite, audit, type Ctx } from "@/lib/services/ctx";
import { advanceDeal } from "@/lib/services/deals";
import { contactBlock } from "@/lib/services/optout";
import { optStr, parse, reqStr } from "@/lib/services/util";

const objectiveIds = MESSAGE_OBJECTIVES.map((o) => o.id) as [string, ...string[]];
const toneIds = MESSAGE_TONES.map((t) => t.id) as [string, ...string[]];

// ---------- modelos ----------

export const templateInput = z.object({
  name: reqStr(120),
  objective: z.enum(objectiveIds),
  service: optStr(120),
  tone: z.enum(toneIds).nullish().transform((v) => v ?? null),
  channel: z.enum(["whatsapp", "email", "instagram"]).default("whatsapp"),
  body: reqStr(3000),
  favorite: z.boolean().optional(),
});
export type TemplateInput = z.input<typeof templateInput>;

export async function listTemplates(ctx: Ctx, f: { objective?: string } = {}) {
  assertModule(ctx, "comercial");
  return db
    .select()
    .from(crmMessageTemplates)
    .where(and(eq(crmMessageTemplates.workspaceId, ctx.workspaceId), eq(crmMessageTemplates.active, true), f.objective ? eq(crmMessageTemplates.objective, f.objective) : undefined))
    .orderBy(desc(crmMessageTemplates.favorite), crmMessageTemplates.objective, crmMessageTemplates.name);
}

export async function saveTemplate(ctx: Ctx, id: string | null, raw: TemplateInput) {
  assertWrite(ctx);
  assertModule(ctx, "comercial");
  const i = parse(templateInput, raw);
  if (!id) {
    const [row] = await db
      .insert(crmMessageTemplates)
      .values({ ...i, favorite: i.favorite ?? false, workspaceId: ctx.workspaceId })
      .returning();
    return row;
  }
  // Versionado: cada edição incrementa a versão do modelo.
  const [cur] = await db.select().from(crmMessageTemplates).where(and(eq(crmMessageTemplates.id, id), eq(crmMessageTemplates.workspaceId, ctx.workspaceId)));
  if (!cur) throw new NotFoundError("Modelo");
  const [row] = await db
    .update(crmMessageTemplates)
    .set({
      ...i,
      favorite: i.favorite ?? cur.favorite,
      version: cur.body === i.body ? cur.version : cur.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(crmMessageTemplates.id, id))
    .returning();
  return row;
}

export async function toggleTemplateFavorite(ctx: Ctx, id: string, favorite: boolean) {
  assertWrite(ctx);
  assertModule(ctx, "comercial");
  const [row] = await db
    .update(crmMessageTemplates)
    .set({ favorite, updatedAt: new Date() })
    .where(and(eq(crmMessageTemplates.id, id), eq(crmMessageTemplates.workspaceId, ctx.workspaceId)))
    .returning();
  if (!row) throw new NotFoundError("Modelo");
  return row;
}

export async function deleteTemplate(ctx: Ctx, id: string) {
  assertWrite(ctx);
  assertModule(ctx, "comercial");
  await db.update(crmMessageTemplates).set({ active: false }).where(and(eq(crmMessageTemplates.id, id), eq(crmMessageTemplates.workspaceId, ctx.workspaceId)));
}

// ---------- contexto verificado do negócio ----------

export type Recipient = {
  id: string;
  label: string;
  kind: "whatsapp" | "telefone" | "email" | "instagram";
  value: string;
  waDigits: string | null;
  mobile: boolean;
  contactId: string | null;
  contactName: string | null;
};

export type ContextHistoryItem = {
  id: string;
  kind: string;
  channel: string | null;
  content: string | null;
  occurredAt: Date;
};

export type ContextPresence = {
  website: string | null;
  instagram: string | null;
  siteType: string | null;
  psiPerformance: number | null;
  hasBooking: boolean | null;
  viewport: boolean | null;
  auditStatus: string | null;
};

export type MessageContext = {
  companyId: string;
  companyName: string;
  dealId: string | null;
  dealTitle: string | null;
  dealStageKey: string | null;
  dealStageLabel: string | null;
  nextStep: string | null;
  nextStepAt: Date | null;
  category: string | null;
  city: string | null;
  contactId: string | null;
  contactName: string | null;
  source: string;
  /** Frase de origem só quando verdadeira (Overture ≠ Google). */
  origin: string | null;
  /** Fatos auditados pelo Radar (somente leitura). */
  facts: string[];
  presence: ContextPresence;
  recentHistory: ContextHistoryItem[];
  recipients: Recipient[];
  blocked: boolean;
  blockedReason: string | null;
  serviceType: string | null;
};

export async function messageContext(ctx: Ctx, input: { dealId?: string | null; companyId?: string | null; contactId?: string | null }): Promise<MessageContext> {
  assertModule(ctx, "comercial");
  let companyId = input.companyId ?? null;
  const dealId = input.dealId ?? null;
  let dealTitle: string | null = null;
  let dealStageKey: string | null = null;
  let dealStageLabel: string | null = null;
  let nextStep: string | null = null;
  let nextStepAt: Date | null = null;
  let serviceType: string | null = null;
  let primaryContact: string | null = input.contactId ?? null;

  if (dealId) {
    const [d] = await db
      .select({
        deal: crmDeals,
        stageKey: crmStages.key,
        stageLabel: crmStages.label,
      })
      .from(crmDeals)
      .leftJoin(crmStages, eq(crmStages.id, crmDeals.stageId))
      .where(and(eq(crmDeals.id, dealId), eq(crmDeals.workspaceId, ctx.workspaceId)));
    if (!d) throw new NotFoundError("Oportunidade");
    companyId = d.deal.companyId;
    serviceType = d.deal.serviceType;
    primaryContact ??= d.deal.primaryContactId;
    dealTitle = d.deal.title;
    dealStageKey = d.stageKey;
    dealStageLabel = d.stageLabel;
    nextStep = d.deal.nextStep;
    nextStepAt = d.deal.nextStepAt;
  }

  if (!companyId) throw new ValidationError("Escolha uma empresa ou oportunidade.");
  const [company] = await db.select().from(crmCompanies).where(and(eq(crmCompanies.id, companyId), eq(crmCompanies.workspaceId, ctx.workspaceId)));
  if (!company) throw new NotFoundError("Empresa");

  const [contacts, historyRows] = await Promise.all([
    db.select().from(crmContacts).where(eq(crmContacts.companyId, company.id)).orderBy(crmContacts.name),
    db
      .select({
        id: crmActivities.id,
        kind: crmActivities.kind,
        channel: crmActivities.channel,
        content: crmActivities.content,
        occurredAt: crmActivities.occurredAt,
      })
      .from(crmActivities)
      .where(
        and(
          eq(crmActivities.workspaceId, ctx.workspaceId),
          dealId ? or(eq(crmActivities.dealId, dealId), eq(crmActivities.companyId, company.id)) : eq(crmActivities.companyId, company.id),
        ),
      )
      .orderBy(desc(crmActivities.occurredAt))
      .limit(8),
  ]);
  const contact = contacts.find((c) => c.id === primaryContact) ?? null;

  const recipients: Recipient[] = [];
  const add = (r: Omit<Recipient, "id" | "waDigits" | "mobile">, phone?: string | null) => {
    const p = parseBrPhone(phone ?? r.value);
    recipients.push({
      ...r,
      id: `${r.kind}:${r.value}:${r.contactId ?? ""}`,
      waDigits: r.kind === "whatsapp" || r.kind === "telefone" ? (p?.mobile ? p.digits : null) : null,
      mobile: !!p?.mobile,
    });
  };
  const addPhone = (value: string | null, who: { id: string | null; name: string | null }, whatsapp = false) => {
    if (!value) return;
    const p = parseBrPhone(value);
    const mobile = !!p?.mobile || whatsapp;
    add(
      {
        label: `${who.name ?? company.name} · ${p?.display ?? value}${p?.mobile ? " (celular — WhatsApp não confirmado)" : whatsapp ? " (WhatsApp informado)" : " (fixo)"}`,
        kind: mobile ? "whatsapp" : "telefone",
        value,
        contactId: who.id,
        contactName: who.name,
      },
      value,
    );
  };
  for (const c of contacts) {
    addPhone(c.whatsapp, { id: c.id, name: c.name }, true);
    addPhone(c.phone, { id: c.id, name: c.name });
    if (c.email) add({ label: `${c.name} · ${c.email}`, kind: "email", value: c.email, contactId: c.id, contactName: c.name });
    if (c.instagram) add({ label: `${c.name} · Instagram`, kind: "instagram", value: c.instagram, contactId: c.id, contactName: c.name });
  }
  addPhone(company.phone, { id: null, name: null });
  if (company.email) add({ label: `${company.name} · ${company.email}`, kind: "email", value: company.email, contactId: null, contactName: null });
  if (company.instagram) add({ label: `${company.name} · Instagram`, kind: "instagram", value: company.instagram, contactId: null, contactName: null });

  let facts: string[] = [];
  let origin: string | null = null;
  let presence: ContextPresence = {
    website: company.website,
    instagram: company.instagram,
    siteType: null,
    psiPerformance: null,
    hasBooking: null,
    viewport: null,
    auditStatus: null,
  };
  if (company.placeId) {
    const place = await placeById(company.placeId);
    if (place) {
      facts = signalsFor(place);
      origin = place.source === "overture" ? `Encontrei a ${company.name} ao mapear negócios${company.city ? ` de ${company.city}` : " da região"}` : null;
      presence = {
        website: company.website ?? place.googleWebsite,
        instagram: company.instagram ?? place.contacts.find((c) => c.kind === "instagram")?.value ?? null,
        siteType: place.siteType,
        psiPerformance: place.psiPerformance,
        hasBooking: place.hasBooking,
        viewport: place.viewport,
        auditStatus: place.auditStatus,
      };
    }
  }
  const block = await contactBlock(ctx, { companyId: company.id, contactId: contact?.id ?? null });
  return {
    companyId: company.id,
    companyName: company.name,
    dealId,
    dealTitle,
    dealStageKey,
    dealStageLabel,
    nextStep,
    nextStepAt,
    category: company.category,
    city: company.city,
    contactId: contact?.id ?? null,
    contactName: contact?.name ?? null,
    source: company.source,
    origin,
    facts,
    presence,
    recentHistory: historyRows,
    recipients: block.blocked ? [] : recipients,
    blocked: block.blocked,
    blockedReason: block.reason,
    serviceType,
  };
}

export function varsFor(mc: MessageContext, extra: { sender: string; service?: string | null; observation?: string | null }): TemplateVars {
  return {
    empresa: mc.companyName,
    contato: greetingVars(mc.contactName),
    remetente: extra.sender,
    servico: extra.service || mc.serviceType || DEFAULT_SERVICE,
    cidade: mc.city,
    observacao: extra.observation ?? null,
    origem: mc.origin,
  };
}

export function buildFromTemplate(body: string, vars: TemplateVars, objective: string, optOut: boolean): string {
  const text = renderTemplate(body, vars);
  return optOut && (COLD_OBJECTIVES as string[]).includes(objective) ? withOptOut(text) : text;
}

// ---------- rascunhos e histórico ----------

export const draftInput = z.object({
  dealId: z.string().uuid().nullish().transform((v) => v ?? null),
  companyId: z.string().uuid().nullish().transform((v) => v ?? null),
  contactId: z.string().uuid().nullish().transform((v) => v ?? null),
  objective: z.enum(objectiveIds),
  service: optStr(120),
  tone: z.enum(toneIds).nullish().transform((v) => v ?? null),
  channel: z.enum(["whatsapp", "email", "instagram"]).default("whatsapp"),
  body: reqStr(4000),
  origin: z.enum(["manual", "modelo", "ia", "mcp"]).default("manual"),
  templateId: z.string().uuid().nullish().transform((v) => v ?? null),
  facts: z.array(z.string().max(300)).max(10).nullish().transform((v) => v ?? null),
});
export type DraftInput = z.input<typeof draftInput>;

export async function saveDraft(ctx: Ctx, raw: DraftInput, draftId?: string | null) {
  assertWrite(ctx);
  assertModule(ctx, "comercial");
  const i = parse(draftInput, raw);
  const block = i.companyId ? await contactBlock(ctx, { companyId: i.companyId, contactId: i.contactId }) : { blocked: false, reason: null };
  if (block.blocked) throw new ValidationError(block.reason ?? "Contato bloqueado.");
  if (draftId) {
    const [cur] = await db
      .select()
      .from(crmMessageDrafts)
      .where(and(eq(crmMessageDrafts.id, draftId), eq(crmMessageDrafts.workspaceId, ctx.workspaceId)));
    if (cur && cur.status === "rascunho") {
      const [updated] = await db
        .update(crmMessageDrafts)
        .set({ ...i, origin: ctx.actor === "mcp" ? "mcp" : i.origin })
        .where(and(eq(crmMessageDrafts.id, cur.id), eq(crmMessageDrafts.workspaceId, ctx.workspaceId)))
        .returning();
      await audit(ctx, "update", "message_draft", updated.id, { origin: updated.origin });
      return updated;
    }
  }
  const [row] = await db
    .insert(crmMessageDrafts)
    .values({ ...i, origin: ctx.actor === "mcp" ? "mcp" : i.origin, workspaceId: ctx.workspaceId, createdBy: ctx.userId })
    .returning();
  await audit(ctx, "create", "message_draft", row.id, { origin: row.origin });
  return row;
}

export async function listDrafts(ctx: Ctx, f: { companyId?: string; dealId?: string; limit?: number } = {}) {
  assertModule(ctx, "comercial");
  return db
    .select({
      id: crmMessageDrafts.id,
      dealId: crmMessageDrafts.dealId,
      companyId: crmMessageDrafts.companyId,
      companyName: crmCompanies.name,
      objective: crmMessageDrafts.objective,
      service: crmMessageDrafts.service,
      channel: crmMessageDrafts.channel,
      body: crmMessageDrafts.body,
      origin: crmMessageDrafts.origin,
      status: crmMessageDrafts.status,
      createdAt: crmMessageDrafts.createdAt,
      sentAt: crmMessageDrafts.sentAt,
    })
    .from(crmMessageDrafts)
    .leftJoin(crmCompanies, eq(crmCompanies.id, crmMessageDrafts.companyId))
    .where(and(eq(crmMessageDrafts.workspaceId, ctx.workspaceId), f.companyId ? eq(crmMessageDrafts.companyId, f.companyId) : undefined, f.dealId ? eq(crmMessageDrafts.dealId, f.dealId) : undefined))
    .orderBy(desc(crmMessageDrafts.createdAt))
    .limit(f.limit ?? 30);
}

/** Link wa.me com o texto pronto. Só devolve se o contato não estiver bloqueado e o número for celular. */
export async function whatsappLink(ctx: Ctx, input: { companyId: string; contactId?: string | null; phone: string; text: string }) {
  assertModule(ctx, "comercial");
  const block = await contactBlock(ctx, { companyId: input.companyId, contactId: input.contactId });
  if (block.blocked) throw new ValidationError(block.reason ?? "Contato bloqueado.");
  const p = parseBrPhone(input.phone);
  if (!p) throw new ValidationError("Número inválido.");
  return waLink(p, input.text);
}

/**
 * Chamado só depois que VOCÊ confirma que enviou. Idempotente por idempotencyKey e/ou draftId:
 * reutiliza rascunho existente (não duplica), registra uma única atividade e cria no máximo um follow-up.
 */
export async function registerSent(
  ctx: Ctx,
  input: {
    draft: DraftInput;
    draftId?: string | null;
    idempotencyKey?: string | null;
    channel: "whatsapp" | "email" | "instagram" | "ligacao";
    followUpDays?: number | null;
    followUpTitle?: string | null;
  },
) {
  assertWrite(ctx);
  assertModule(ctx, "comercial");
  const i = parse(draftInput, input.draft);
  const block = i.companyId ? await contactBlock(ctx, { companyId: i.companyId, contactId: i.contactId }) : { blocked: false, reason: null };
  if (block.blocked) throw new ValidationError(block.reason ?? "Contato bloqueado.");
  const idemKey = input.idempotencyKey?.trim() ? input.idempotencyKey.trim().slice(0, 120) : null;
  const origin = ctx.actor === "mcp" ? "mcp" : i.origin;
  const followUpDays = input.followUpDays == null ? 3 : Math.max(0, Math.min(30, Math.round(input.followUpDays)));
  const followUpTitle = (input.followUpTitle ?? "").trim().slice(0, 180) || "Follow-up da mensagem enviada";
  const now = new Date();

  const { draft, alreadySent } = await db.transaction(async (tx) => {
    if (idemKey) {
      const [byKey] = await tx
        .select()
        .from(crmMessageDrafts)
        .where(and(eq(crmMessageDrafts.workspaceId, ctx.workspaceId), eq(crmMessageDrafts.idempotencyKey, idemKey)))
        .for("update");
      if (byKey) return { draft: byKey, alreadySent: true };
    }

    let row: typeof crmMessageDrafts.$inferSelect | null = null;
    if (input.draftId) {
      const [existing] = await tx
        .select()
        .from(crmMessageDrafts)
        .where(and(eq(crmMessageDrafts.id, input.draftId), eq(crmMessageDrafts.workspaceId, ctx.workspaceId)))
        .for("update");
      if (!existing) throw new NotFoundError("Rascunho");
      if (existing.status === "enviada") return { draft: existing, alreadySent: true };
      const [updated] = await tx
        .update(crmMessageDrafts)
        .set({ ...i, origin, status: "enviada", sentAt: now, ...(idemKey ? { idempotencyKey: idemKey } : {}) })
        .where(and(eq(crmMessageDrafts.id, existing.id), eq(crmMessageDrafts.workspaceId, ctx.workspaceId)))
        .returning();
      row = updated;
    } else {
      const [inserted] = await tx
        .insert(crmMessageDrafts)
        .values({ ...i, origin, workspaceId: ctx.workspaceId, createdBy: ctx.userId, status: "enviada", sentAt: now, idempotencyKey: idemKey })
        .onConflictDoNothing()
        .returning();
      if (!inserted && idemKey) {
        const [winner] = await tx
          .select()
          .from(crmMessageDrafts)
          .where(and(eq(crmMessageDrafts.workspaceId, ctx.workspaceId), eq(crmMessageDrafts.idempotencyKey, idemKey)));
        if (winner) return { draft: winner, alreadySent: true };
      }
      row = inserted;
    }
    if (!row) throw new Error("Falha ao registrar rascunho enviado.");

    await tx.insert(crmActivities).values({
      workspaceId: ctx.workspaceId,
      dealId: row.dealId,
      companyId: row.companyId,
      contactId: row.contactId,
      kind: "mensagem_enviada",
      channel: input.channel,
      content: row.body.slice(0, 4000),
      meta: { draftId: row.id, origem: row.origin, objetivo: row.objective, modeloId: row.templateId, fatos: row.facts },
      authorId: ctx.userId,
      authorKind: ctx.actor,
      occurredAt: now,
    });

    if (row.contactId) {
      await tx.update(crmContacts).set({ lastContactAt: now }).where(eq(crmContacts.id, row.contactId));
    }

    if (followUpDays > 0 && (row.dealId || row.companyId)) {
      const followAt = addDays(now, followUpDays);
      if (row.dealId) {
        await tx
          .update(crmDeals)
          .set({ nextStep: followUpTitle, nextStepAt: followAt, lastActivityAt: now, updatedAt: now })
          .where(and(eq(crmDeals.id, row.dealId), eq(crmDeals.workspaceId, ctx.workspaceId)));
      }
      const [task] = await tx
        .insert(crmTasks)
        .values({
          workspaceId: ctx.workspaceId,
          title: followUpTitle,
          dueAt: followAt,
          dealId: row.dealId,
          companyId: row.companyId,
          priority: "media",
          source: "automacao",
          dedupeKey: `followup:${row.id}`,
          createdBy: ctx.userId,
        })
        .onConflictDoNothing()
        .returning();
      if (task) {
        await tx.insert(crmActivities).values({
          workspaceId: ctx.workspaceId,
          dealId: row.dealId,
          companyId: row.companyId,
          kind: "tarefa",
          content: `Tarefa criada: ${task.title}`,
          meta: { taskId: task.id },
          authorId: ctx.userId,
          authorKind: ctx.actor,
          occurredAt: now,
        });
      }
    }

    return { draft: row, alreadySent: false };
  });

  if (!alreadySent) {
    if (draft.dealId && draft.objective === "primeiro_contato") {
      await advanceDeal(ctx, draft.dealId, "primeiro_contato").catch(() => null);
    }
    await audit(ctx, "send", "message_draft", draft.id, { channel: input.channel, followUpDays });
  }
  return draft;
}

const replyInput = z.object({
  companyId: z.string().uuid(),
  dealId: z.string().uuid().nullish().transform((v) => v ?? null),
  contactId: z.string().uuid().nullish().transform((v) => v ?? null),
  channel: z.enum(["whatsapp", "email", "instagram", "ligacao"]).default("whatsapp"),
  summary: reqStr(1500),
  advanceToConversation: z.boolean().default(true),
  followUpDays: z.number().int().min(0).max(30).default(2),
  followUpTitle: optStr(180),
});
export type ReplyInput = z.input<typeof replyInput>;

/** Registra resposta do cliente direto do Estúdio, avança para conversa (opcional) e agenda retorno. */
export async function recordClientReply(ctx: Ctx, raw: ReplyInput) {
  assertWrite(ctx);
  assertModule(ctx, "comercial");
  const i = parse(replyInput, raw);
  const now = new Date();
  const [company] = await db.select().from(crmCompanies).where(and(eq(crmCompanies.id, i.companyId), eq(crmCompanies.workspaceId, ctx.workspaceId)));
  if (!company) throw new NotFoundError("Empresa");

  await db.transaction(async (tx) => {
    await tx.insert(crmActivities).values({
      workspaceId: ctx.workspaceId,
      dealId: i.dealId,
      companyId: i.companyId,
      contactId: i.contactId,
      kind: "resposta",
      channel: i.channel,
      content: i.summary,
      authorId: ctx.userId,
      authorKind: ctx.actor,
      occurredAt: now,
    });

    if (i.contactId) {
      await tx.update(crmContacts).set({ lastContactAt: now }).where(eq(crmContacts.id, i.contactId));
    }

    if (i.followUpDays > 0) {
      const due = addDays(now, i.followUpDays);
      const title = i.followUpTitle ?? "Responder / dar retorno ao cliente";
      if (i.dealId) {
        await tx
          .update(crmDeals)
          .set({ nextStep: title, nextStepAt: due, lastActivityAt: now, updatedAt: now })
          .where(and(eq(crmDeals.id, i.dealId), eq(crmDeals.workspaceId, ctx.workspaceId)));
      }
      await tx.insert(crmTasks).values({
        workspaceId: ctx.workspaceId,
        title,
        dueAt: due,
        dealId: i.dealId,
        companyId: i.companyId,
        priority: "alta",
        source: "manual",
        createdBy: ctx.userId,
      });
    } else if (i.dealId) {
      await tx.update(crmDeals).set({ lastActivityAt: now, updatedAt: now }).where(and(eq(crmDeals.id, i.dealId), eq(crmDeals.workspaceId, ctx.workspaceId)));
    }
  });

  if (i.dealId && i.advanceToConversation) {
    await advanceDeal(ctx, i.dealId, "conversa").catch(() => null);
  }
  await audit(ctx, "reply", "company", i.companyId, { channel: i.channel, dealId: i.dealId });
  return { ok: true as const };
}

const followUpInput = z.object({
  companyId: z.string().uuid(),
  dealId: z.string().uuid().nullish().transform((v) => v ?? null),
  title: reqStr(180),
  days: z.number().int().min(1).max(60).default(3),
  priority: z.enum(["baixa", "media", "alta", "urgente"]).default("media"),
});
export type FollowUpInput = z.input<typeof followUpInput>;

/** Agenda tarefa de follow-up direto da aba Mensagens e sincroniza próximo passo da oportunidade. */
export async function scheduleMessageFollowUp(ctx: Ctx, raw: FollowUpInput) {
  assertWrite(ctx);
  assertModule(ctx, "comercial");
  const i = parse(followUpInput, raw);
  const now = new Date();
  const due = addDays(now, i.days);
  const [company] = await db.select().from(crmCompanies).where(and(eq(crmCompanies.id, i.companyId), eq(crmCompanies.workspaceId, ctx.workspaceId)));
  if (!company) throw new NotFoundError("Empresa");

  const task = await db.transaction(async (tx) => {
    const [t] = await tx
      .insert(crmTasks)
      .values({
        workspaceId: ctx.workspaceId,
        title: i.title,
        dueAt: due,
        dealId: i.dealId,
        companyId: i.companyId,
        priority: i.priority,
        source: "manual",
        createdBy: ctx.userId,
      })
      .returning();
    if (i.dealId) {
      await tx
        .update(crmDeals)
        .set({ nextStep: i.title, nextStepAt: due, lastActivityAt: now, updatedAt: now })
        .where(and(eq(crmDeals.id, i.dealId), eq(crmDeals.workspaceId, ctx.workspaceId)));
    }
    await tx.insert(crmActivities).values({
      workspaceId: ctx.workspaceId,
      dealId: i.dealId,
      companyId: i.companyId,
      kind: "tarefa",
      content: `Follow-up agendado: ${i.title}`,
      meta: { taskId: t.id },
      authorId: ctx.userId,
      authorKind: ctx.actor,
      occurredAt: now,
    });
    return t;
  });

  await audit(ctx, "schedule_followup", "task", task.id, { days: i.days });
  return task;
}

export { OPT_OUT_LINE, SOURCES };
