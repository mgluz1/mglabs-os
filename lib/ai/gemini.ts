import "server-only";

import { ApiError, GoogleGenAI } from "@google/genai";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import type { Ctx } from "@/lib/services/ctx";
import { ymdSP } from "@/lib/dates";

export class AiError extends Error {}

/** Modelo configurável. O padrão segue a geração Flash-Lite atual na Gemini API, com fallbacks seguros se 404. */
export const DEFAULT_MODEL = "gemini-3.5-flash-lite";
export const MODEL_FALLBACKS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite", "gemini-2.5-flash"] as const;

export function aiConfig() {
  const key = process.env.GEMINI_API_KEY?.trim();
  return {
    enabled: !!key && process.env.GEMINI_ENABLED !== "false",
    hasKey: !!key,
    model: process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL,
    dailyLimit: Math.max(1, Number(process.env.GEMINI_DAILY_LIMIT) || 60),
  };
}

/** Garante que o Gemini está configurado/habilitado antes de consultar dados no banco. */
export function assertAiEnabled() {
  const cfg = aiConfig();
  if (!cfg.enabled) throw new AiError("A IA não está configurada (GEMINI_API_KEY ausente). Use os modelos e a escrita manual.");
  return cfg;
}

export type AiFeature = "mensagem" | "resumo" | "proxima_acao" | "tarefas" | "resposta" | "refino" | "teste";

/** Reserva 1 chamada do limite diário (atômico com advisory lock por workspace/dia). Falso = limite atingido. */
export async function reserveAiQuota(ctx: Ctx, feature: AiFeature, limit: number): Promise<boolean> {
  const day = ymdSP();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ctx.workspaceId + ":" + day}))`);
    const { rows: totalRows } = await tx.execute<{ n: number }>(sql`
      select coalesce(sum(calls), 0)::int as n
      from ai_usage
      where workspace_id = ${ctx.workspaceId} and day = ${day}::date
    `);
    if ((totalRows[0]?.n ?? 0) >= limit) return false;
    await tx.execute(sql`
      insert into ai_usage (workspace_id, day, feature, calls)
      values (${ctx.workspaceId}, ${day}::date, ${feature}, 1)
      on conflict (workspace_id, day, feature) do update set calls = ai_usage.calls + 1
    `);
    return true;
  });
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

type Ai = InstanceType<typeof GoogleGenAI>;

/** Lista os modelos da conta e escolhe um Flash/Flash-Lite estável que aceite generateContent (preferindo o mais novo). */
export async function discoverModel(ai: Ai, skip: Set<string> = new Set()): Promise<string | null> {
  try {
    const names: string[] = [];
    const pager = await ai.models.list({ config: { pageSize: 100 } });
    for await (const m of pager) {
      const name = (m.name ?? "").replace(/^models\//, "");
      const actions = m.supportedActions ?? [];
      if (!/flash/i.test(name) || /(image|tts|live|audio|embed|preview|exp|thinking|robotics|computer)/i.test(name)) continue;
      if (actions.length && !actions.includes("generateContent")) continue;
      if (!skip.has(name)) names.push(name);
    }
    // ordena por versão desc e prefere "lite" (cota mais folgada no plano gratuito)
    const ver = (n: string) => Number(/gemini-(\d+(?:\.\d+)?)/.exec(n)?.[1] ?? 0);
    names.sort((a, b) => ver(b) - ver(a) || Number(/lite/.test(b)) - Number(/lite/.test(a)));
    return names[0] ?? null;
  } catch {
    return null;
  }
}

export type GeminiTest = { ok: boolean; keyConfigured: boolean; model: string; modelUsed?: string; latencyMs?: number; available?: string[]; error?: string };

/** Teste de conexão de ponta a ponta (1 chamada mínima, sem dados do CRM). Conta 1 no limite diário. */
export async function testGemini(ctx: Ctx): Promise<GeminiTest> {
  const cfg = aiConfig();
  if (!cfg.hasKey) return { ok: false, keyConfigured: false, model: cfg.model, error: "GEMINI_API_KEY não encontrada no ambiente. Adicione a chave na Vercel e faça um novo deploy." };
  if (!cfg.enabled) return { ok: false, keyConfigured: true, model: cfg.model, error: "GEMINI_ENABLED=false desativa a IA. Remova a variável ou troque por true." };
  const started = Date.now();
  try {
    const out = await generateJson(ctx, "teste", { system: "Você responde somente JSON.", user: 'Responda exatamente {"ok":true}.', schema: z.object({ ok: z.boolean() }), temperature: 0, maxOutputTokens: 30 });
    let available: string[] | undefined;
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!, httpOptions: { timeout: 10_000 } });
      available = [];
      const pager = await ai.models.list({ config: { pageSize: 100 } });
      for await (const m of pager) {
        const n = (m.name ?? "").replace(/^models\//, "");
        if (/^gemini-.*flash/i.test(n) && !/(image|tts|live|audio|embed)/i.test(n)) available.push(n);
        if (available.length >= 12) break;
      }
    } catch {
      available = undefined;
    }
    return { ok: out.ok, keyConfigured: true, model: cfg.model, latencyMs: Date.now() - started, available };
  } catch (e) {
    return { ok: false, keyConfigured: true, model: cfg.model, latencyMs: Date.now() - started, error: e instanceof Error ? e.message : "Falha no teste." };
  }
}

/** Confere sem gastar cota se o modelo configurado existe para a chave atual. */
export async function checkGeminiModel(): Promise<{ ok: boolean; model: string; error?: string }> {
  const cfg = aiConfig();
  if (!cfg.enabled) return { ok: false, model: cfg.model, error: "GEMINI_API_KEY ausente ou desativada." };
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!, httpOptions: { timeout: 10_000 } });
    await ai.models.get({ model: cfg.model });
    return { ok: true, model: cfg.model };
  } catch (e) {
    return { ok: false, model: cfg.model, error: friendly(e).message };
  }
}

/**
 * Chama o Gemini pedindo JSON. Sem retry automático em 429/503; tenta fallback apenas se 404 (modelo indisponível).
 * Logs só têm recurso, modelo, status e duração — nunca o conteúdo.
 */
export async function generateJson<S extends z.ZodTypeAny>(ctx: Ctx, feature: AiFeature, input: { system: string; user: string; schema: S; temperature?: number; maxOutputTokens?: number }): Promise<z.output<S>> {
  const cfg = assertAiEnabled();
  if (!(await reserveAiQuota(ctx, feature, cfg.dailyLimit))) throw new AiError(`Limite diário de ${cfg.dailyLimit} chamadas de IA atingido. Volte amanhã ou use o modo manual.`);
  const started = Date.now();
  const candidates = [cfg.model, ...MODEL_FALLBACKS.filter((m) => m !== cfg.model)];
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!, httpOptions: { timeout: 25_000 } });
    let res: Awaited<ReturnType<typeof ai.models.generateContent>> | null = null;
    let modelUsed = cfg.model;
    let lastErr: unknown = null;
    for (const model of candidates) {
      try {
        res = await ai.models.generateContent({
          model,
          contents: input.user,
          config: {
            systemInstruction: input.system,
            temperature: input.temperature ?? 0.7,
            maxOutputTokens: input.maxOutputTokens ?? 1100,
            responseMimeType: "application/json",
            responseJsonSchema: z.toJSONSchema(input.schema),
          },
        });
        modelUsed = model;
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        const status = err instanceof ApiError ? err.status : 0;
        if (status !== 404) throw err;
      }
    }
    if (!res) {
      // todos os candidatos deram 404: descobre na própria conta um modelo Flash que gere conteúdo
      const found = await discoverModel(ai, new Set(candidates));
      if (!found) throw lastErr ?? new Error("Nenhum modelo Gemini disponível.");
      res = await ai.models.generateContent({
        model: found,
        contents: input.user,
        config: { systemInstruction: input.system, temperature: input.temperature ?? 0.7, maxOutputTokens: input.maxOutputTokens ?? 1100, responseMimeType: "application/json", responseJsonSchema: z.toJSONSchema(input.schema) },
      });
      modelUsed = found;
    }
    const raw = res.text ?? "";
    const parsed = input.schema.safeParse(JSON.parse(raw.replace(/^```json\s*|```\s*$/g, "")));
    console.info("gemini", { feature, model: modelUsed, ms: Date.now() - started, ok: parsed.success });
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
