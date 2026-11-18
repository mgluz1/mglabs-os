import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { crmCompanies, crmContacts, crmStages } from "@/db/schema";
import { db } from "@/lib/db";
import { parseBrPhone } from "@/lib/phone";
import { placeById } from "@/lib/queries";
import { logActivity, timelineFor } from "@/lib/services/activities";
import { assertWrite, audit, NotFoundError, type Ctx } from "@/lib/services/ctx";
import { limitOf, normInstagram, normPhone, normUrl, optStr, parse, reqStr, tagsSchema } from "@/lib/services/util";
import { SOURCES } from "@/lib/config/crm";

const sourceIds = SOURCES.map((s) => s.id) as [string, ...string[]];

export const companyInput = z.object({
  name: reqStr(200),
  legalName: optStr(200),
  status: z.enum(["lead", "cliente", "inativo"]).default("lead"),
  category: optStr(80),
  website: optStr(300),
  phone: optStr(40),
  email: optStr(200),
  instagram: optStr(200),
  address: optStr(300),
  neighborhood: optStr(120),
  city: optStr(120),
  source: z.enum(sourceIds).default("manual"),
  tags: tagsSchema,
  notes: optStr(4000),
});
export type CompanyInput = z.input<typeof companyInput>;

export const contactInput = z.object({
  companyId: z.string().uuid().nullish().transform((v) => v ?? null),
  name: reqStr(160),
  role: optStr(120),
  email: optStr(200),
  phone: optStr(40),
  whatsapp: optStr(40),
  instagram: optStr(200),
  preferredChannel: z.enum(["whatsapp", "email", "ligacao", "instagram"]).nullish().transform((v) => v ?? null),
  source: optStr(80),
  notes: optStr(2000),
});
export type ContactInput = z.input<typeof contactInput>;

export type CompanyRow = typeof crmCompanies.$inferSelect;
export type ContactRow = typeof crmContacts.$inferSelect;

export async function createCompany(ctx: Ctx, raw: CompanyInput): Promise<CompanyRow> {
  assertWrite(ctx);
  const i = parse(companyInput, raw);
  const [row] = await db
    .insert(crmCompanies)
    .values({ ...i, workspaceId: ctx.workspaceId, phone: normPhone(i.phone), website: normUrl(i.website), instagram: normInstagram(i.instagram) })
    .returning();
  await logActivity(ctx, { companyId: row.id, kind: "sistema", content: "Empresa cadastrada" });
  await audit(ctx, "create", "company", row.id);
  return row;
}

export async function updateCompany(ctx: Ctx, id: string, raw: Partial<CompanyInput>): Promise<CompanyRow> {
  assertWrite(ctx);
  const i = parse(companyInput.partial(), raw);
  const patch: Partial<typeof crmCompanies.$inferInsert> = { ...i, updatedAt: new Date() };
  if ("phone" in i) patch.phone = normPhone(i.phone);
  if ("website" in i) patch.website = normUrl(i.website);
  if ("instagram" in i) patch.instagram = normInstagram(i.instagram);
  for (const k of Object.keys(patch) as (keyof typeof patch)[]) if (patch[k] === undefined) delete patch[k];
  const [row] = await db.update(crmCompanies).set(patch).where(and(eq(crmCompanies.id, id), eq(crmCompanies.workspaceId, ctx.workspaceId))).returning();
  if (!row) throw new NotFoundError("Empresa");
  await audit(ctx, "update", "company", id);
  return row;
}

export async function archiveCompany(ctx: Ctx, id: string, archived: boolean) {
  assertWrite(ctx);
  await db.update(crmCompanies).set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() }).where(and(eq(crmCompanies.id, id), eq(crmCompanies.workspaceId, ctx.workspaceId)));
  await audit(ctx, archived ? "archive" : "unarchive", "company", id);
}

export type CompanyListItem = {
  id: string;
  name: string;
  status: string;
  category: string | null;
  city: string | null;
  source: string;
  phone: string | null;
  email: string | null;
  tags: string[];
  placeId: string | null;
  openDeals: number;
  contacts: number;
  lastActivityAt: Date | null;
  createdAt: Date;
};

export async function listCompanies(ctx: Ctx, f: { q?: string; status?: string; limit?: number; offset?: number } = {}): Promise<CompanyListItem[]> {
  const q = f.q?.trim();
  const { rows } = await db.execute<{ id: string; name: string; status: string; category: string | null; city: string | null; source: string; phone: string | null; email: string | null; tags: string[]; place_id: string | null; open_deals: number; contacts: number; last_activity_at: string | null; created_at: string }>(sql`
    select c.id, c.name, c.status, c.category, c.city, c.source, c.phone, c.email, c.tags, c.place_id, c.created_at,
      (select count(*)::int from crm_deals d join crm_stages s on s.id = d.stage_id where d.company_id = c.id and s.kind = 'open') as open_deals,
      (select count(*)::int from crm_contacts k where k.company_id = c.id) as contacts,
      (select max(a.occurred_at) from crm_activities a where a.company_id = c.id) as last_activity_at
    from crm_companies c
    where c.workspace_id = ${ctx.workspaceId} and c.archived_at is null
      ${f.status ? sql`and c.status = ${f.status}` : sql``}
      ${q ? sql`and (c.name ilike ${"%" + q + "%"} or c.city ilike ${"%" + q + "%"} or c.email ilike ${"%" + q + "%"} or c.phone ilike ${"%" + q + "%"})` : sql``}
    order by c.updated_at desc
    limit ${limitOf(f.limit)} offset ${f.offset ?? 0}`);
  return rows.map((r) => ({ id: r.id, name: r.name, status: r.status, category: r.category, city: r.city, source: r.source, phone: r.phone, email: r.email, tags: r.tags ?? [], placeId: r.place_id, openDeals: r.open_deals, contacts: r.contacts, lastActivityAt: r.last_activity_at ? new Date(r.last_activity_at) : null, createdAt: new Date(r.created_at) }));
}

export async function getCompany(ctx: Ctx, id: string): Promise<CompanyRow> {
  const [row] = await db.select().from(crmCompanies).where(and(eq(crmCompanies.id, id), eq(crmCompanies.workspaceId, ctx.workspaceId)));
  if (!row) throw new NotFoundError("Empresa");
  return row;
}

/** Ficha 360°: tudo que se relaciona à empresa, numa só consulta de leitura. */
export async function getCompany360(ctx: Ctx, id: string) {
  const company = await getCompany(ctx, id);
  const [contacts, deals, tasks, proposals, projects, receivables, timeline] = await Promise.all([
    db.select().from(crmContacts).where(eq(crmContacts.companyId, id)).orderBy(crmContacts.name),
    db.execute<{ id: string; title: string; stage_key: string; stage_label: string; stage_kind: string; value: string | null; next_step: string | null; next_step_at: string | null; created_at: string }>(sql`
      select d.id, d.title, s.key as stage_key, s.label as stage_label, s.kind as stage_kind, d.estimated_value_cents::text as value, d.next_step, d.next_step_at, d.created_at
      from crm_deals d join crm_stages s on s.id = d.stage_id where d.company_id = ${id} order by d.created_at desc`),
    db.execute<{ id: string; title: string; status: string; priority: string; due_at: string | null }>(sql`
      select id, title, status, priority, due_at from crm_tasks where company_id = ${id} and workspace_id = ${ctx.workspaceId} order by (status in ('concluida','cancelada')), due_at nulls last limit 30`),
    db.execute<{ id: string; title: string; status: string; version: number; total: string }>(sql`
      select id, title, status, version, total_cents::text as total from crm_proposals where company_id = ${id} order by created_at desc`),
    db.execute<{ id: string; name: string; status: string; phase: string }>(sql`select id, name, status, phase from crm_projects where company_id = ${id} order by created_at desc`),
    db.execute<{ amount: string; paid: string }>(sql`
      select coalesce(sum(r.amount_cents),0)::text as amount,
             coalesce(sum((select coalesce(sum(p.amount_cents),0) from crm_payments p where p.receivable_id = r.id)),0)::text as paid
      from crm_receivables r where r.company_id = ${id} and r.status <> 'cancelada'`),
    timelineFor(ctx, { companyId: id }, 150),
  ]);
  return {
    company,
    contacts,
    deals: deals.rows.map((d) => ({ id: d.id, title: d.title, stageKey: d.stage_key, stageLabel: d.stage_label, stageKind: d.stage_kind, valueCents: d.value == null ? null : Number(d.value), nextStep: d.next_step, nextStepAt: d.next_step_at ? new Date(d.next_step_at) : null })),
    tasks: tasks.rows.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, dueAt: t.due_at ? new Date(t.due_at) : null })),
    proposals: proposals.rows.map((p) => ({ id: p.id, title: p.title, status: p.status, version: p.version, totalCents: Number(p.total) })),
    projects: projects.rows,
    finance: { billedCents: Number(receivables.rows[0]?.amount ?? 0), receivedCents: Number(receivables.rows[0]?.paid ?? 0) },
    timeline,
  };
}

// ---------- contatos ----------

export async function createContact(ctx: Ctx, raw: ContactInput): Promise<ContactRow> {
  assertWrite(ctx);
  const i = parse(contactInput, raw);
  if (i.companyId) await getCompany(ctx, i.companyId);
  const [row] = await db
    .insert(crmContacts)
    .values({ ...i, workspaceId: ctx.workspaceId, phone: normPhone(i.phone), whatsapp: normPhone(i.whatsapp), instagram: normInstagram(i.instagram) })
    .returning();
  await logActivity(ctx, { companyId: row.companyId, contactId: row.id, kind: "sistema", content: `Contato adicionado: ${row.name}` });
  await audit(ctx, "create", "contact", row.id);
  return row;
}

export async function updateContact(ctx: Ctx, id: string, raw: Partial<ContactInput>): Promise<ContactRow> {
  assertWrite(ctx);
  const i = parse(contactInput.partial(), raw);
  const patch: Partial<typeof crmContacts.$inferInsert> = { ...i, updatedAt: new Date() };
  if ("phone" in i) patch.phone = normPhone(i.phone);
  if ("whatsapp" in i) patch.whatsapp = normPhone(i.whatsapp);
  if ("instagram" in i) patch.instagram = normInstagram(i.instagram);
  for (const k of Object.keys(patch) as (keyof typeof patch)[]) if (patch[k] === undefined) delete patch[k];
  const [row] = await db.update(crmContacts).set(patch).where(and(eq(crmContacts.id, id), eq(crmContacts.workspaceId, ctx.workspaceId))).returning();
  if (!row) throw new NotFoundError("Contato");
  return row;
}

export async function deleteContact(ctx: Ctx, id: string) {
  assertWrite(ctx);
  await db.delete(crmContacts).where(and(eq(crmContacts.id, id), eq(crmContacts.workspaceId, ctx.workspaceId)));
  await audit(ctx, "delete", "contact", id);
}

export async function listContacts(ctx: Ctx, f: { q?: string; companyId?: string; limit?: number } = {}) {
  const q = f.q?.trim();
  const { rows } = await db.execute<{ id: string; name: string; role: string | null; email: string | null; phone: string | null; whatsapp: string | null; company_id: string | null; company_name: string | null; opted_out: boolean; last_contact_at: string | null }>(sql`
    select k.id, k.name, k.role, k.email, k.phone, k.whatsapp, k.company_id, c.name as company_name, k.opted_out, k.last_contact_at
    from crm_contacts k left join crm_companies c on c.id = k.company_id
    where k.workspace_id = ${ctx.workspaceId}
      ${f.companyId ? sql`and k.company_id = ${f.companyId}` : sql``}
      ${q ? sql`and (k.name ilike ${"%" + q + "%"} or k.email ilike ${"%" + q + "%"} or k.phone ilike ${"%" + q + "%"} or c.name ilike ${"%" + q + "%"})` : sql``}
    order by k.name limit ${limitOf(f.limit, 100, 300)}`);
  return rows.map((r) => ({ id: r.id, name: r.name, role: r.role, email: r.email, phone: r.phone, whatsapp: r.whatsapp, companyId: r.company_id, companyName: r.company_name, optedOut: r.opted_out, lastContactAt: r.last_contact_at ? new Date(r.last_contact_at) : null }));
}

// ---------- Radar → CRM ----------

/**
 * Cria (ou reaproveita) a empresa ligada a um lugar do Radar, sem duplicar.
 * Os contatos do lugar (telefone, e-mail, Instagram) viram dados da empresa, com a origem anotada.
 */
export async function companyFromPlace(ctx: Ctx, placeId: string): Promise<{ company: CompanyRow; created: boolean }> {
  assertWrite(ctx);
  const [existing] = await db.select().from(crmCompanies).where(and(eq(crmCompanies.workspaceId, ctx.workspaceId), eq(crmCompanies.placeId, placeId)));
  if (existing) return { company: existing, created: false };
  const place = await placeById(placeId);
  if (!place) throw new NotFoundError("Lugar");
  if (place.optedOut) throw new Error("Este negócio pediu para não ser contatado.");
  const pick = (k: string) => place.contacts.find((c) => c.kind === k)?.value ?? null;
  const phone = parseBrPhone(pick("whatsapp") ?? pick("phone") ?? place.googlePhone)?.e164 ?? null;
  const [row] = await db
    .insert(crmCompanies)
    .values({
      workspaceId: ctx.workspaceId,
      name: place.name,
      category: place.category,
      website: place.siteType === "site_proprio" ? place.googleWebsite : null,
      phone,
      email: pick("email"),
      instagram: pick("instagram"),
      address: place.address,
      neighborhood: place.neighborhood,
      city: place.city,
      source: "radar",
      placeId,
      metadata: { origin: place.source === "overture" ? "Overture Maps (dados abertos)" : "Radar", phoneConfirmed: place.contacts.some((c) => (c.kind === "whatsapp" || c.kind === "phone") && c.confirmed), leadScore: place.score },
    })
    .onConflictDoNothing()
    .returning();
  if (!row) {
    const [again] = await db.select().from(crmCompanies).where(and(eq(crmCompanies.workspaceId, ctx.workspaceId), eq(crmCompanies.placeId, placeId)));
    return { company: again, created: false };
  }
  await logActivity(ctx, { companyId: row.id, kind: "sistema", content: "Empresa adicionada a partir do Radar" });
  return { company: row, created: true };
}

/** Empresas sem nenhum registro no Radar também existem; este atalho lista as sem vínculo (diagnóstico). */
export async function countManualCompanies(ctx: Ctx) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(crmCompanies).where(and(eq(crmCompanies.workspaceId, ctx.workspaceId), isNull(crmCompanies.placeId)));
  return r.n;
}

export async function stageByKey(ctx: Ctx, key: string) {
  const [s] = await db.select().from(crmStages).where(and(eq(crmStages.workspaceId, ctx.workspaceId), eq(crmStages.key, key)));
  if (!s) throw new NotFoundError("Etapa");
  return s;
}
