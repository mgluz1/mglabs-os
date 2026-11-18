import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { crmCompanies, crmContacts, crmDeals, crmMessageDrafts, crmMessageTemplates } from "@/db/schema";
import { MESSAGE_OBJECTIVES, MESSAGE_TONES, SOURCES } from "@/lib/config/crm";
import { db } from "@/lib/db";
import { DEFAULT_SERVICE, OPT_OUT_LINE, COLD_OBJECTIVES, greetingVars, renderTemplate, withOptOut, type TemplateVars } from "@/lib/messages";
import { parseBrPhone, waLink } from "@/lib/phone";
import { placeById } from "@/lib/queries";
import { signalsFor } from "@/lib/radar-signals";
import { logActivity } from "@/lib/services/activities";
import { addDays } from "@/lib/dates";
import { advanceDeal } from "@/lib/services/deals";
import { assertWrite, audit, NotFoundError, ValidationError, type Ctx } from "@/lib/services/ctx";
import { contactBlock } from "@/lib/services/optout";
import { createTask } from "@/lib/services/tasks";
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
});
export type TemplateInput = z.input<typeof templateInput>;

export async function listTemplates(ctx: Ctx, f: { objective?: string } = {}) {
  return db
    .select()
    .from(crmMessageTemplates)
    .where(and(eq(crmMessageTemplates.workspaceId, ctx.workspaceId), eq(crmMessageTemplates.active, true), f.objective ? eq(crmMessageTemplates.objective, f.objective) : undefined))
    .orderBy(crmMessageTemplates.objective, crmMessageTemplates.name);
}

export async function saveTemplate(ctx: Ctx, id: string | null, raw: TemplateInput) {
  assertWrite(ctx);
  const i = parse(templateInput, raw);
  if (!id) {
    const [row] = await db.insert(crmMessageTemplates).values({ ...i, workspaceId: ctx.workspaceId }).returning();
    return row;
  }
  // Versionado: cada edição incrementa a versão do modelo.
  const [cur] = await db.select().from(crmMessageTemplates).where(and(eq(crmMessageTemplates.id, id), eq(crmMessageTemplates.workspaceId, ctx.workspaceId)));
  if (!cur) throw new NotFoundError("Modelo");
  const [row] = await db
    .update(crmMessageTemplates)
    .set({ ...i, version: cur.body === i.body ? cur.version : cur.version + 1, updatedAt: new Date() })
    .where(eq(crmMessageTemplates.id, id))
    .returning();
  return row;
}

export async function deleteTemplate(ctx: Ctx, id: string) {
  assertWrite(ctx);
  await db.update(crmMessageTemplates).set({ active: false }).where(and(eq(crmMessageTemplates.id, id), eq(crmMessageTemplates.workspaceId, ctx.workspaceId)));
}

// ---------- contexto verificado do negócio ----------

export type Recipient = { id: string; label: string; kind: "whatsapp" | "telefone" | "email" | "instagram"; value: string; waDigits: string | null; mobile: boolean; contactId: string | null; contactName: string | null };

export type MessageContext = {
  companyId: string;
  companyName: string;
  dealId: string | null;
  category: string | null;
  city: string | null;
  contactId: string | null;
  contactName: string | null;
  source: string;
  /** Frase de origem só quando verdadeira (Overture ≠ Google). */
  origin: string | null;
  /** Fatos auditados pelo Radar (somente leitura). */
  facts: string[];
  recipients: Recipient[];
  blocked: boolean;
  blockedReason: string | null;
  serviceType: string | null;
};

export async function messageContext(ctx: Ctx, input: { dealId?: string | null; companyId?: string | null; contactId?: string | null }): Promise<MessageContext> {
  let companyId = input.companyId ?? null;
  const dealId = input.dealId ?? null;
  let serviceType: string | null = null;
  let primaryContact: string | null = input.contactId ?? null;
  if (dealId) {
    const [d] = await db.select().from(crmDeals).where(and(eq(crmDeals.id, dealId), eq(crmDeals.workspaceId, ctx.workspaceId)));
    if (!d) throw new NotFoundError("Oportunidade");
    companyId = d.companyId;
    serviceType = d.serviceType;
    primaryContact ??= d.primaryContactId;
  }
  if (!companyId) throw new ValidationError("Escolha uma empresa ou oportunidade.");
  const [company] = await db.select().from(crmCompanies).where(and(eq(crmCompanies.id, companyId), eq(crmCompanies.workspaceId, ctx.workspaceId)));
  if (!company) throw new NotFoundError("Empresa");
  const contacts = await db.select().from(crmContacts).where(eq(crmContacts.companyId, company.id)).orderBy(crmContacts.name);
  const contact = contacts.find((c) => c.id === primaryContact) ?? null;

  const recipients: Recipient[] = [];
  const add = (r: Omit<Recipient, "id" | "waDigits" | "mobile">, phone?: string | null) => {
    const p = parseBrPhone(phone ?? r.value);
    recipients.push({ ...r, id: `${r.kind}:${r.value}:${r.contactId ?? ""}`, waDigits: r.kind === "whatsapp" || r.kind === "telefone" ? (p?.mobile ? p.digits : null) : null, mobile: !!p?.mobile });
  };
  const addPhone = (value: string | null, who: { id: string | null; name: string | null }, whatsapp = false) => {
    if (!value) return;
    const p = parseBrPhone(value);
    const mobile = !!p?.mobile || whatsapp;
    add({ label: `${who.name ?? company.name} · ${p?.display ?? value}${p?.mobile ? " (celular — WhatsApp não confirmado)" : whatsapp ? " (WhatsApp informado)" : " (fixo)"}`, kind: mobile ? "whatsapp" : "telefone", value, contactId: who.id, contactName: who.name }, value);
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
  if (company.placeId) {
    const place = await placeById(company.placeId);
    if (place) {
      facts = signalsFor(place);
      origin = place.source === "overture" ? `Encontrei a ${company.name} ao mapear negócios${company.city ? ` de ${company.city}` : " da região"}` : null;
    }
  }
  const block = await contactBlock(ctx, { companyId: company.id, contactId: contact?.id ?? null });
  return {
    companyId: company.id, companyName: company.name, dealId, category: company.category, city: company.city, contactId: contact?.id ?? null, contactName: contact?.name ?? null,
    source: company.source, origin, facts, recipients: block.blocked ? [] : recipients, blocked: block.blocked, blockedReason: block.reason, serviceType,
  };
}

export function varsFor(mc: MessageContext, extra: { sender: string; service?: string | null; observation?: string | null }): TemplateVars {
  return { empresa: mc.companyName, contato: greetingVars(mc.contactName), remetente: extra.sender, servico: extra.service || mc.serviceType || DEFAULT_SERVICE, cidade: mc.city, observacao: extra.observation ?? null, origem: mc.origin };
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

export async function saveDraft(ctx: Ctx, raw: DraftInput) {
  assertWrite(ctx);
  const i = parse(draftInput, raw);
  const block = i.companyId ? await contactBlock(ctx, { companyId: i.companyId, contactId: i.contactId }) : { blocked: false, reason: null };
  if (block.blocked) throw new ValidationError(block.reason ?? "Contato bloqueado.");
  const [row] = await db
    .insert(crmMessageDrafts)
    .values({ ...i, origin: ctx.actor === "mcp" ? "mcp" : i.origin, workspaceId: ctx.workspaceId, createdBy: ctx.userId })
    .returning();
  await audit(ctx, "create", "message_draft", row.id, { origin: row.origin });
  return row;
}

export async function listDrafts(ctx: Ctx, f: { companyId?: string; dealId?: string; limit?: number } = {}) {
  return db
    .select()
    .from(crmMessageDrafts)
    .where(and(eq(crmMessageDrafts.workspaceId, ctx.workspaceId), f.companyId ? eq(crmMessageDrafts.companyId, f.companyId) : undefined, f.dealId ? eq(crmMessageDrafts.dealId, f.dealId) : undefined))
    .orderBy(desc(crmMessageDrafts.createdAt))
    .limit(f.limit ?? 30);
}

/** Link wa.me com o texto pronto. Só devolve se o contato não estiver bloqueado e o número for celular. */
export async function whatsappLink(ctx: Ctx, input: { companyId: string; contactId?: string | null; phone: string; text: string }) {
  const block = await contactBlock(ctx, { companyId: input.companyId, contactId: input.contactId });
  if (block.blocked) throw new ValidationError(block.reason ?? "Contato bloqueado.");
  const p = parseBrPhone(input.phone);
  if (!p) throw new ValidationError("Número inválido.");
  return waLink(p, input.text);
}

/**
 * Chamado só depois que VOCÊ confirma que enviou. Registra no histórico, leva o negócio para
 * "Primeiro contato" e agenda o follow-up. Nada é enviado automaticamente.
 */
export async function registerSent(ctx: Ctx, input: { draft: DraftInput; channel: "whatsapp" | "email" | "instagram" | "ligacao" }) {
  assertWrite(ctx);
  const draft = await saveDraft(ctx, input.draft);
  await db.update(crmMessageDrafts).set({ status: "enviada", sentAt: new Date() }).where(eq(crmMessageDrafts.id, draft.id));
  const companyId = draft.companyId;
  await logActivity(ctx, {
    dealId: draft.dealId, companyId, contactId: draft.contactId, kind: "mensagem_enviada", channel: input.channel, content: draft.body,
    meta: { draftId: draft.id, origem: draft.origin, objetivo: draft.objective, modeloId: draft.templateId, fatos: draft.facts },
  });
  if (draft.dealId) {
    const [d] = await db.select().from(crmDeals).where(eq(crmDeals.id, draft.dealId));
    if (d) {
      const followAt = addDays(new Date(), 3);
      await db.update(crmDeals).set({ nextStep: "Follow-up da mensagem enviada", nextStepAt: followAt, updatedAt: new Date() }).where(eq(crmDeals.id, d.id));
      await createTask(ctx, { title: "Follow-up da mensagem enviada", dueAt: followAt, dealId: d.id, companyId: d.companyId, priority: "media", source: "automacao", dedupeKey: `followup:${draft.id}` });
      if (draft.objective === "primeiro_contato") await advanceDeal(ctx, d.id, "primeiro_contato").catch(() => null);
    }
  }
  return draft;
}

export { OPT_OUT_LINE, SOURCES };
