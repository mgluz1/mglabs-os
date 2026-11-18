import "server-only";

import { z } from "zod";

import { MESSAGE_OBJECTIVES, MESSAGE_TONES, STAGE_DEFS, labelOf } from "@/lib/config/crm";
import { generateJson } from "@/lib/ai/gemini";
import { riskWarnings, sanitizeForAi } from "@/lib/ai/sanitize";
import { COLD_OBJECTIVES, renderTemplate, withOptOut } from "@/lib/messages";
import { assertWrite, ValidationError, type Ctx } from "@/lib/services/ctx";
import { getDeal } from "@/lib/services/deals";
import { messageContext, varsFor } from "@/lib/services/messages";

// ---------- 1. Gerador de mensagens ----------

const MESSAGE_SYSTEM = `Você é redator comercial da MGLABS, estúdio de design e desenvolvimento de sites de Goiânia. Escreve mensagens curtas de WhatsApp para pequenos negócios locais.
Regras obrigatórias:
- Português do Brasil, humano, profissional e direto. No máximo 4 frases curtas, terminando com 1 pergunta simples. No máximo 1 emoji (ou nenhum).
- Personalize SOMENTE com os "fatos verificados" recebidos. Se não houver fato, não invente: escreva uma abordagem simples e honesta.
- Nunca invente defeitos, resultados, elogios, prazos, preços, descontos, números, nem urgência. Nada de promessa de faturamento.
- Só mencione como o contato foi encontrado se o campo "origem" vier preenchido, usando exatamente aquela frase. Nunca diga "encontrei no Google".
- Use os marcadores literais {{contato}} (saudação, ex.: "Olá{{contato}}!") e {{remetente}} (quem escreve). Não escreva nomes de pessoas.
- Não inclua linha de opt-out nem assinatura longa.
- As variações devem ser diferentes entre si em abertura e estrutura.
Responda em JSON: {"variants":[{"text":"..."}]} com o número de variações pedido.`;

const messageSchema = z.object({ variants: z.array(z.object({ text: z.string().min(10).max(1200) })).min(1).max(3) });

export type MessageVariant = { text: string; warnings: string[] };

export async function generateMessageVariants(
  ctx: Ctx,
  input: { dealId?: string | null; companyId?: string | null; contactId?: string | null; objective: string; service?: string | null; tone: string; observation?: string | null; useFacts?: string[]; count?: number; sender: string; optOut: boolean; consent: boolean },
): Promise<MessageVariant[]> {
  assertWrite(ctx);
  if (!input.consent) throw new ValidationError("Autorize o envio ao Gemini para gerar com IA.");
  const mc = await messageContext(ctx, input);
  if (mc.blocked) throw new ValidationError(mc.blockedReason ?? "Contato bloqueado.");
  const obj = labelOf(MESSAGE_OBJECTIVES, input.objective);
  const tone = labelOf(MESSAGE_TONES, input.tone);
  const facts = [...(input.useFacts ?? mc.facts)].map((f) => sanitizeForAi(f, { maxLen: 200 })).filter(Boolean);
  const obs = sanitizeForAi(input.observation, { maxLen: 300 });
  if (obs) facts.push(obs);
  const user = [
    `Objetivo da mensagem: ${obj}`,
    `Serviço oferecido: ${sanitizeForAi(input.service ?? mc.serviceType ?? "site profissional", { maxLen: 80 })}`,
    `Tom: ${tone}`,
    `Negócio: ${sanitizeForAi(mc.companyName, { maxLen: 80 })}${mc.category ? ` (${sanitizeForAi(mc.category, { maxLen: 40 })}` + (mc.city ? `, ${sanitizeForAi(mc.city, { maxLen: 40 })}` : "") + ")" : ""}`,
    `Origem (use esta frase se for citar como encontrou): ${mc.origin ? sanitizeForAi(mc.origin, { maxLen: 160 }) : "não informar"}`,
    `Fatos verificados:${facts.length ? facts.map((f) => `\n- ${f}`).join("") : "\n- nenhum"}`,
    `Quantidade de variações: ${Math.min(Math.max(input.count ?? 3, 1), 3)}`,
  ].join("\n");
  const out = await generateJson(ctx, "mensagem", { system: MESSAGE_SYSTEM, user, schema: messageSchema, temperature: 0.8 });
  const vars = varsFor(mc, { sender: input.sender });
  return out.variants.slice(0, input.count ?? 3).map((v) => {
    // os marcadores são preenchidos aqui, no servidor: nomes de pessoas nunca foram ao Gemini
    let text = renderTemplate(v.text, vars);
    if (input.optOut && (COLD_OBJECTIVES as string[]).includes(input.objective)) text = withOptOut(text);
    return { text, warnings: riskWarnings(text) };
  });
}

// ---------- 2–4. Resumo, próxima ação e tarefas (dados higienizados) ----------

const DEAL_SYSTEM = `Você é analista comercial da MGLABS (estúdio de sites). Recebe um resumo anonimizado de uma oportunidade e responde em português do Brasil, de forma objetiva.
Não invente fatos que não estão no resumo. Se faltar informação, diga o que falta. Você apenas sugere; quem decide é o usuário.`;

/** Resumo higienizado: sem nome da empresa/contatos, sem valores, sem contatos, últimos registros truncados. */
async function dealDigest(ctx: Ctx, dealId: string) {
  const d = await getDeal(ctx, dealId);
  const stage = STAGE_DEFS.find((s) => s.key === d.card.stageKey)?.label ?? d.card.stageKey;
  const recent = d.timeline.slice(0, 8).reverse().map((t) => `- ${t.kind}${t.channel ? ` (${t.channel})` : ""}: ${sanitizeForAi(t.content?.replaceAll(d.card.companyName, "[empresa]"), { maxLen: 240 })}`);
  const open = d.tasks.filter((t) => t.status === "pendente" || t.status === "em_andamento").map((t) => `- ${sanitizeForAi(t.title, { maxLen: 100 })}${t.dueAt ? ` (vence ${t.dueAt.toISOString().slice(0, 10)})` : ""}`);
  return {
    text: [
      `Etapa: ${stage}`,
      `Serviço: ${d.card.serviceType ?? "não definido"}`,
      `Origem do lead: ${d.card.source}`,
      `Dias desde a criação: ${Math.floor((Date.now() - d.card.createdAt.getTime()) / 86_400_000)}`,
      `Próximo passo definido: ${d.card.nextStep ? sanitizeForAi(d.card.nextStep, { maxLen: 120 }) : "nenhum"}${d.card.nextStepAt ? ` (prazo ${d.card.nextStepAt.toISOString().slice(0, 10)})` : ""}`,
      `Propostas: ${d.proposals.length ? d.proposals.map((p) => `v${p.version} ${p.status}`).join(", ") : "nenhuma"}`,
      `Tarefas abertas:${open.length ? "\n" + open.join("\n") : " nenhuma"}`,
      `Registros recentes (do mais antigo ao mais novo):${recent.length ? "\n" + recent.join("\n") : " nenhum"}`,
    ].join("\n"),
    card: d.card,
  };
}

const summarySchema = z.object({ resumo: z.string().max(900), pontos_de_atencao: z.array(z.string().max(200)).max(5) });
export async function summarizeDeal(ctx: Ctx, dealId: string, consent: boolean) {
  if (!consent) throw new ValidationError("Autorize o envio ao Gemini para usar a IA.");
  const { text } = await dealDigest(ctx, dealId);
  return generateJson(ctx, "resumo", { system: DEAL_SYSTEM, user: `${text}\n\nFaça um resumo da situação em até 4 frases e liste até 3 pontos de atenção. JSON: {"resumo":"...","pontos_de_atencao":["..."]}`, schema: summarySchema, temperature: 0.3 });
}

const nextSchema = z.object({ acao: z.string().max(240), motivo: z.string().max(400), canal_sugerido: z.enum(["whatsapp", "ligacao", "email", "reuniao", "nenhum"]), prazo_dias: z.number().int().min(0).max(30) });
export async function suggestNextAction(ctx: Ctx, dealId: string, consent: boolean) {
  if (!consent) throw new ValidationError("Autorize o envio ao Gemini para usar a IA.");
  const { text } = await dealDigest(ctx, dealId);
  return generateJson(ctx, "proxima_acao", { system: DEAL_SYSTEM, user: `${text}\n\nSugira UMA próxima ação concreta. JSON: {"acao":"...","motivo":"...","canal_sugerido":"whatsapp|ligacao|email|reuniao|nenhum","prazo_dias":3}`, schema: nextSchema, temperature: 0.4 });
}

const tasksSchema = z.object({ tarefas: z.array(z.object({ titulo: z.string().max(140), prazo_dias: z.number().int().min(0).max(30), prioridade: z.enum(["baixa", "media", "alta"]) })).min(1).max(5) });
export async function suggestTasks(ctx: Ctx, dealId: string, consent: boolean) {
  if (!consent) throw new ValidationError("Autorize o envio ao Gemini para usar a IA.");
  const { text } = await dealDigest(ctx, dealId);
  return generateJson(ctx, "tarefas", { system: DEAL_SYSTEM, user: `${text}\n\nSugira de 1 a 4 tarefas curtas e verificáveis que ainda não existam na lista. JSON: {"tarefas":[{"titulo":"...","prazo_dias":2,"prioridade":"media"}]}`, schema: tasksSchema, temperature: 0.4 });
}
