import "server-only";

import { ApiError, GoogleGenAI } from "@google/genai";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import type { Ctx } from "@/lib/services/ctx";
import { ymdSP } from "@/lib/dates";

export class AiError extends Error {}

/** Modelo configurável. O padrão segue docs/ARQUITETURA-IA-MCP-GEMINI.md; confirme na sua conta em aistudio.google.com/rate-limit. */
export const DEFAULT_MODEL = "gemini-3.5-flash-lite";

export function aiConfig() {
  const key = process.env.GEMINI_API_KEY?.trim();
  return {
    enabled: !!key && process.env.GEMINI_ENABLED !== "false",
    hasKey: !!key,
    model: process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL,
    dailyLimit: Math.max(1, Number(process.env.GEMINI_DAILY_LIMIT) || 60),
  };
}

export type AiFeature = "mensagem" | "resumo" | "proxima_acao" | "tarefas";

/** Reserva 1 chamada do limite diário (atômico). Falso = limite atingido. */
async function reserve(ctx: Ctx, feature: AiFeature, limit: number): Promise<boolean> {
  const day = ymdSP();
  const { rows } = await db.execute<{ calls: number }>(sql`
    with total as (select coalesce(sum(calls),0)::int as n from ai_usage where workspace_id = ${ctx.workspaceId} and day = ${day}::date)
    insert into ai_usage (workspace_id, day, feature, calls)
    select ${ctx.workspaceId}, ${day}::date, ${feature}, 1 from total where total.n < ${limit}
    on conflict (workspace_id, day, feature) do update set calls = ai_usage.calls + 1
    returning calls`);
  return rows.length > 0;
}
async function markError(ctx: Ctx, feature: AiFeature) {
  await db.execute(sql`update ai_usage set errors = errors + 1 where workspace_id = ${ctx.workspaceId} and day = ${ymdSP()}::date and feature = ${feature}`).catch(() => null);
}

export async function aiUsageToday(ctx: Ctx) {
  const { rows } = await db.execute<{ feature: string; calls: number; errors: number }>(sql`select feature, calls, errors from ai_usage where workspace_id = ${ctx.workspaceId} and day = ${ymdSP()}::date`);
  return { calls: rows.reduce((s, r) => s + r.calls, 0), errors: rows.reduce((s, r) => s + r.errors, 0), byFeature: rows };
}

function friendly(e: unknown): AiError {
  const status = e instanceof ApiError ? e.status : 0;
  const msg = e instanceof Error ? e.message : "";
  if (status === 429) return new AiError("O limite gratuito do Gemini foi atingido agora. Tente mais tarde ou escreva manualmente — nada foi perdido.");
  if (status === 503 || status === 500) return new AiError("O Gemini está indisponível no momento. Tente novamente em alguns minutos ou continue no modo manual.");
  if (status === 400 && /API key/i.test(msg)) return new AiError("A GEMINI_API_KEY é inválida. Confira a chave no ambiente.");
  if (status === 401 || status === 403) return new AiError("A chave do Gemini não tem permissão para este modelo. Confira a GEMINI_API_KEY e as cotas da conta.");
  if (status === 404) return new AiError(`O modelo "${aiConfig().model}" não existe para esta conta. Ajuste GEMINI_MODEL (veja os modelos disponíveis no AI Studio).`);
  if (/abort|timeout/i.test(msg)) return new AiError("O Gemini demorou demais para responder. Tente novamente.");
  return new AiError("Não foi possível usar a IA agora. O modo manual continua disponível.");
}

/**
 * Chama o Gemini pedindo JSON. Sem retry automático (429/503 viram mensagem e modo manual).
 * Logs só têm recurso, modelo, status e duração — nunca o conteúdo.
 */
export async function generateJson<S extends z.ZodTypeAny>(ctx: Ctx, feature: AiFeature, input: { system: string; user: string; schema: S; temperature?: number; maxOutputTokens?: number }): Promise<z.output<S>> {
  const cfg = aiConfig();
  if (!cfg.enabled) throw new AiError("A IA não está configurada (GEMINI_API_KEY ausente). Use os modelos e a escrita manual.");
  if (!(await reserve(ctx, feature, cfg.dailyLimit))) throw new AiError(`Limite diário de ${cfg.dailyLimit} chamadas de IA atingido. Volte amanhã ou use o modo manual.`);
  const started = Date.now();
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!, httpOptions: { timeout: 25_000 } });
    const res = await ai.models.generateContent({
      model: cfg.model,
      contents: input.user,
      config: {
        systemInstruction: input.system,
        temperature: input.temperature ?? 0.7,
        maxOutputTokens: input.maxOutputTokens ?? 900,
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(input.schema),
      },
    });
    const raw = res.text ?? "";
    const parsed = input.schema.safeParse(JSON.parse(raw.replace(/^```json\s*|```\s*$/g, "")));
    console.info("gemini", { feature, model: cfg.model, ms: Date.now() - started, ok: parsed.success });
    if (!parsed.success) {
      await markError(ctx, feature);
      throw new AiError("A IA devolveu uma resposta fora do formato. Tente gerar de novo.");
    }
    return parsed.data;
  } catch (e) {
    if (e instanceof AiError) throw e;
    await markError(ctx, feature);
    console.error("gemini", { feature, model: cfg.model, ms: Date.now() - started, status: e instanceof ApiError ? e.status : "n/a" });
    if (e instanceof SyntaxError) throw new AiError("A IA devolveu uma resposta fora do formato. Tente gerar de novo.");
    throw friendly(e);
  }
}
