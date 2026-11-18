"use server";

import { aiConfig, aiUsageToday, AiError } from "@/lib/ai/gemini";
import { generateMessageVariants, suggestNextAction, suggestTasks, summarizeDeal } from "@/lib/ai/features";
import { act, UserError } from "@/lib/actions/helpers";
import { requireCtx } from "@/lib/services/ctx";

// IA é sempre opcional: erros do Gemini viram mensagens claras (UserError) e o resto do app segue funcionando.
function wrap<T>(fn: Parameters<typeof act<T>>[0]) {
  return act(async (ctx) => {
    try {
      return await fn(ctx);
    } catch (e) {
      if (e instanceof AiError) throw new UserError(e.message);
      throw e;
    }
  });
}

export async function aiStatusAction() {
  try {
    const ctx = await requireCtx();
    const cfg = aiConfig();
    const usage = cfg.enabled ? await aiUsageToday(ctx) : { calls: 0, errors: 0, byFeature: [] };
    return { enabled: cfg.enabled, model: cfg.model, dailyLimit: cfg.dailyLimit, usedToday: usage.calls, errorsToday: usage.errors };
  } catch {
    return { enabled: false, model: aiConfig().model, dailyLimit: aiConfig().dailyLimit, usedToday: 0, errorsToday: 0 };
  }
}

export async function generateMessagesAction(input: Omit<Parameters<typeof generateMessageVariants>[1], "sender">) {
  // o remetente vem do servidor (MEU_NOME), nunca do navegador
  return wrap((ctx) => generateMessageVariants(ctx, { ...input, sender: process.env.MEU_NOME || "Miguel" }));
}
export async function summarizeDealAction(dealId: string, consent: boolean) {
  return wrap((ctx) => summarizeDeal(ctx, dealId, consent));
}
export async function nextActionAction(dealId: string, consent: boolean) {
  return wrap((ctx) => suggestNextAction(ctx, dealId, consent));
}
export async function suggestTasksAction(dealId: string, consent: boolean) {
  return wrap((ctx) => suggestTasks(ctx, dealId, consent));
}
