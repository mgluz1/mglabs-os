import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { apiTokens, workspaceMembers } from "@/db/schema";
import type { RoleId } from "@/lib/config/crm";
import { db } from "@/lib/db";
import { assertModule, assertWrite, audit, NotFoundError, ValidationError, type Ctx } from "@/lib/services/ctx";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Gera um token de acesso ao MCP. O valor completo só aparece nesta resposta; no banco fica o hash. */
export async function createApiToken(ctx: Ctx, input: { name: string; scope: "read" | "write"; expiresInDays?: number | null }) {
  assertWrite(ctx);
  assertModule(ctx, "config");
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new ValidationError("Dê um nome ao token.");
  const secret = `mglabs_${randomBytes(32).toString("base64url")}`;
  const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null;
  const [row] = await db
    .insert(apiTokens)
    .values({ workspaceId: ctx.workspaceId, userId: ctx.userId, name, scope: input.scope, prefix: secret.slice(0, 14), tokenHash: sha256(secret), expiresAt })
    .returning();
  await audit(ctx, "create", "api_token", row.id, { scope: input.scope });
  return { id: row.id, token: secret };
}

export async function listApiTokens(ctx: Ctx) {
  assertModule(ctx, "config");
  return db
    .select({ id: apiTokens.id, name: apiTokens.name, prefix: apiTokens.prefix, scope: apiTokens.scope, expiresAt: apiTokens.expiresAt, lastUsedAt: apiTokens.lastUsedAt, revokedAt: apiTokens.revokedAt, createdAt: apiTokens.createdAt })
    .from(apiTokens)
    .where(eq(apiTokens.workspaceId, ctx.workspaceId))
    .orderBy(desc(apiTokens.createdAt));
}

export async function revokeApiToken(ctx: Ctx, id: string) {
  assertWrite(ctx);
  assertModule(ctx, "config");
  const r = await db.update(apiTokens).set({ revokedAt: new Date() }).where(and(eq(apiTokens.id, id), eq(apiTokens.workspaceId, ctx.workspaceId), isNull(apiTokens.revokedAt))).returning({ id: apiTokens.id });
  if (!r.length) throw new NotFoundError("Token");
  await audit(ctx, "revoke", "api_token", id);
}

/** Autentica um Bearer do MCP e devolve o contexto com o escopo do token (nunca mais que o papel do dono). */
export async function ctxFromToken(bearer: string | null): Promise<Ctx | null> {
  if (!bearer?.startsWith("mglabs_") || bearer.length > 200) return null;
  const [t] = await db.select().from(apiTokens).where(and(eq(apiTokens.tokenHash, sha256(bearer)), isNull(apiTokens.revokedAt)));
  if (!t) return null;
  if (t.expiresAt && t.expiresAt < new Date()) return null;
  const [m] = await db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, t.workspaceId), eq(workspaceMembers.userId, t.userId)));
  if (!m) return null; // dono do token perdeu o acesso: o token deixa de valer
  await db.update(apiTokens).set({ lastUsedAt: sql`now()` }).where(eq(apiTokens.id, t.id));
  return { workspaceId: t.workspaceId, userId: t.userId, email: m.email, role: m.role as RoleId, actor: "mcp", scope: t.scope === "write" ? "write" : "read" };
}
