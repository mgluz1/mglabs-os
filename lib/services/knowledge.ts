import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { crmKnowledge } from "@/db/schema";
import { KNOWLEDGE_KINDS } from "@/lib/config/crm";
import { db } from "@/lib/db";
import { assertAnyModule, assertWrite, NotFoundError, type Ctx } from "@/lib/services/ctx";
import { optStr, parse, reqStr, tagsSchema } from "@/lib/services/util";

const kinds = KNOWLEDGE_KINDS.map((k) => k.id) as [string, ...string[]];
export const knowledgeInput = z.object({
  kind: z.enum(kinds).default("processo"),
  title: reqStr(200),
  body: optStr(40000),
  url: optStr(500),
  tags: tagsSchema,
  companyId: z.string().uuid().nullish().transform((v) => v ?? null),
});
export type KnowledgeInput = z.input<typeof knowledgeInput>;

export async function listKnowledge(ctx: Ctx, f: { kind?: string; q?: string; companyId?: string } = {}) {
  assertAnyModule(ctx, "comercial", "operacao");
  const q = f.q?.trim();
  return db
    .select()
    .from(crmKnowledge)
    .where(
      and(
        eq(crmKnowledge.workspaceId, ctx.workspaceId),
        f.kind ? eq(crmKnowledge.kind, f.kind) : undefined,
        f.companyId ? eq(crmKnowledge.companyId, f.companyId) : undefined,
        q ? sql`(${crmKnowledge.title} ilike ${"%" + q + "%"} or ${crmKnowledge.body} ilike ${"%" + q + "%"} or ${q} = any(${crmKnowledge.tags}))` : undefined,
      ),
    )
    .orderBy(desc(crmKnowledge.updatedAt))
    .limit(200);
}

export async function saveKnowledge(ctx: Ctx, id: string | null, raw: KnowledgeInput) {
  assertWrite(ctx);
  assertAnyModule(ctx, "comercial", "operacao");
  const i = parse(knowledgeInput, raw);
  if (!id) return (await db.insert(crmKnowledge).values({ ...i, workspaceId: ctx.workspaceId }).returning())[0];
  const [row] = await db.update(crmKnowledge).set({ ...i, updatedAt: new Date() }).where(and(eq(crmKnowledge.id, id), eq(crmKnowledge.workspaceId, ctx.workspaceId))).returning();
  if (!row) throw new NotFoundError("Item");
  return row;
}

export async function deleteKnowledge(ctx: Ctx, id: string) {
  assertWrite(ctx);
  assertAnyModule(ctx, "comercial", "operacao");
  await db.delete(crmKnowledge).where(and(eq(crmKnowledge.id, id), eq(crmKnowledge.workspaceId, ctx.workspaceId)));
}
