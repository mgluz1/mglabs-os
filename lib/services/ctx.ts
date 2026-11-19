import "server-only";

import { and, count, eq, sql } from "drizzle-orm";
import { cache } from "react";

import { crmAuditEvents, crmServices, crmMessageTemplates, crmStages, workspaceMembers, workspaces } from "@/db/schema";
import { auth } from "@/lib/auth/server";
import { STAGE_DEFS, type RoleId } from "@/lib/config/crm";
import { db } from "@/lib/db";
import { DEFAULT_TEMPLATES } from "@/lib/messages";

export type Actor = "user" | "mcp" | "ia";
export type Ctx = {
  workspaceId: string;
  userId: string;
  email: string | null;
  role: RoleId;
  actor: Actor;
  /** Tokens MCP só de leitura não podem gravar. */
  scope: "read" | "write";
};

export class NoAccessError extends Error {
  constructor(msg = "Sem acesso a este espaço de trabalho.") {
    super(msg);
  }
}
export class ForbiddenError extends Error {
  constructor(msg = "Sem permissão para esta ação.") {
    super(msg);
  }
}
export class NotFoundError extends Error {
  constructor(what = "Registro") {
    super(`${what} não encontrado.`);
  }
}
export class ValidationError extends Error {}

export function assertWrite(ctx: Ctx) {
  if (ctx.scope !== "write") throw new ForbiddenError("Este acesso é somente leitura.");
}

export type Module = "comercial" | "operacao" | "financeiro" | "config";
const ACCESS: Record<RoleId, Module[]> = {
  owner: ["comercial", "operacao", "financeiro", "config"],
  admin: ["comercial", "operacao", "financeiro", "config"],
  comercial: ["comercial", "operacao"],
  producao: ["operacao"],
  financeiro: ["financeiro", "comercial"],
};
export function assertModule(ctx: Ctx, mod: Module) {
  if (!ACCESS[ctx.role]?.includes(mod)) throw new ForbiddenError();
}
export function assertAnyModule(ctx: Ctx, ...mods: Module[]) {
  if (!mods.some((mod) => ACCESS[ctx.role]?.includes(mod))) throw new ForbiddenError();
}
export function assertAdmin(ctx: Ctx, msg = "Só administradores podem executar esta ação.") {
  if (ctx.role !== "owner" && ctx.role !== "admin") throw new ForbiddenError(msg);
}
export const canModule = (ctx: Ctx, mod: Module) => !!ACCESS[ctx.role]?.includes(mod);

/** Cria etapas, catálogo e modelos iniciais (idempotente). Não insere dados de clientes. */
export async function seedWorkspaceDefaults(workspaceId: string) {
  await db
    .insert(crmStages)
    .values(STAGE_DEFS.map((s, i) => ({ workspaceId, key: s.key, label: s.label, position: i + 1, probability: s.probability, kind: s.kind })))
    .onConflictDoNothing();
  const [{ n: nServ }] = await db.select({ n: count() }).from(crmServices).where(eq(crmServices.workspaceId, workspaceId));
  if (!nServ) {
    // Sem preços inventados: valor de referência fica "a definir" até você editar o catálogo.
    await db.insert(crmServices).values(
      [
        ["Landing page", "Página única focada em conversão.", 7],
        ["Site institucional", "Site com várias páginas e identidade do negócio.", 21],
        ["Site + agendamento", "Site com agendamento online integrado.", 30],
        ["Automação de WhatsApp", "Fluxos de atendimento e lembretes.", 14],
        ["Projeto sob medida", "Escopo definido caso a caso.", null],
      ].map(([name, description, days], i) => ({ workspaceId, name: name as string, description: description as string, estimatedDays: days as number | null, position: i })),
    );
  }
  const existingTpls = await db
    .select({ name: crmMessageTemplates.name })
    .from(crmMessageTemplates)
    .where(eq(crmMessageTemplates.workspaceId, workspaceId));
  const haveNames = new Set(existingTpls.map((t) => t.name));
  const missingTpls = DEFAULT_TEMPLATES.filter((t) => !haveNames.has(t.name));
  if (missingTpls.length) {
    await db.insert(crmMessageTemplates).values(
      missingTpls.map((t) => ({
        workspaceId,
        name: t.name,
        objective: t.objective,
        service: t.service ?? null,
        body: t.body,
        channel: "whatsapp",
      })),
    );
  }
}

// Garante etapas, catálogo e modelos iniciais uma vez por instância (idempotente), inclusive quando o
// membro foi cadastrado fora do app (ex.: direto no banco) e o primeiro acesso nunca passou por aqui.
const seeded = new Set<string>();

async function resolveMembership(userId: string, email: string | null) {
  const [m] = await db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, userId)).limit(1);
  if (m) {
    if (!seeded.has(m.workspaceId)) {
      await seedWorkspaceDefaults(m.workspaceId);
      seeded.add(m.workspaceId);
    }
    return m;
  }
  // Primeiro acesso: só vira proprietário se o espaço ainda não tem ninguém
  // (e, se OWNER_EMAIL estiver definido, só esse e-mail). Qualquer outro cadastro fica sem acesso.
  const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (ownerEmail && email?.toLowerCase() !== ownerEmail) throw new NoAccessError();
  const [ws] = await db.select().from(workspaces).orderBy(workspaces.createdAt).limit(1);
  const workspaceId = ws?.id ?? (await db.insert(workspaces).values({ name: "MGLABS" }).returning({ id: workspaces.id }))[0].id;
  const claimed = await db.execute<{ user_id: string }>(sql`
    insert into workspace_members (workspace_id, user_id, email, role)
    select ${workspaceId}, ${userId}, ${email}, 'owner'
    where not exists (select 1 from workspace_members where workspace_id = ${workspaceId})
    returning user_id`);
  if (!claimed.rows.length) throw new NoAccessError();
  await seedWorkspaceDefaults(workspaceId);
  const [created] = await db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
  return created;
}

/** Contexto da sessão atual (Server Actions, páginas e route handlers). */
export const requireCtx = cache(async (): Promise<Ctx> => {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) throw new NoAccessError("Não autenticado");
  const m = await resolveMembership(user.id, user.email ?? null);
  return { workspaceId: m.workspaceId, userId: user.id, email: m.email, role: m.role as RoleId, actor: "user", scope: "write" };
});

export async function audit(ctx: Ctx, action: string, entity: string, entityId?: string | null, meta?: Record<string, unknown>) {
  try {
    await db.insert(crmAuditEvents).values({ workspaceId: ctx.workspaceId, actor: ctx.userId, actorKind: ctx.actor, action, entity, entityId: entityId ?? null, meta: meta ?? null });
  } catch (e) {
    console.error("audit", e instanceof Error ? e.message : e);
  }
}
