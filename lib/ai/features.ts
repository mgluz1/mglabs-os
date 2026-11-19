import "server-only";

import { z } from "zod";

import { MESSAGE_LENGTHS, MESSAGE_OBJECTIVES, MESSAGE_TONES, STAGE_DEFS, labelOf, type MessageLengthId } from "@/lib/config/crm";
import { assertAiEnabled, generateJson } from "@/lib/ai/gemini";
import { riskWarnings, sanitizeForAi } from "@/lib/ai/sanitize";
import { COLD_OBJECTIVES, renderTemplate, withOptOut } from "@/lib/messages";
import { assertModule, assertWrite, ValidationError, type Ctx } from "@/lib/services/ctx";
import { getDeal } from "@/lib/services/deals";
import { messageContext, varsFor } from "@/lib/services/messages";

// ---------- 1. Gerador de mensagens ----------

const MESSAGE_SYSTEM = `Você escreve mensagens comerciais para a MGLABS (estúdio de sites, automação de WhatsApp e soluções digitais) em português do Brasil, como se o próprio fundador ({{remetente}}) estivesse mandando no WhatsApp ou e-mail para um dono de negócio local.

Regras obrigatórias de estilo e veracidade:
- Linguagem humana, natural e direta — zero tom robótico, zero "Prezado", zero "Espero que esteja tudo bem", zero "soluções inovadoras / transformação digital / alavancar resultados / sinergia".
- NUNCA faça elogios falsos ou não verificados ("admiro muito o trabalho de vocês", "excelente atendimento").
- NUNCA invente defeitos, números, prazos, descontos, promessas de faturamento ou garantias. Use SOMENTE os fatos verificados e o histórico recebidos.
- Se houver histórico recente (follow-up, resposta, proposta ou negociação), dê continuidade natural ao que já aconteceu em vez de se apresentar do zero.
- Se for primeiro contato sem fato auditado, escreva uma abordagem simples, honesta e sem exageros.
- Só mencione como encontrou a empresa se o campo "origem" vier preenchido, exatamente com aquela ideia. Nunca diga "encontrei no Google".
- Respeite rigorosamente o tamanho pedido:
  * curta: 2 a 3 frases curtas, diretas, sem blocos longos (ideal para leitura rápida no celular).
  * media: 3 a 4 frases naturais com contexto objetivo e 1 pergunta simples no final.
  * detalhada: 4 a 6 frases bem organizadas (contexto claro, benefício prático sem promessa vazia e próximo passo definido), ainda conversacional.
- Use no máximo 1 emoji (ou nenhum).
- Use os marcadores literais {{contato}} (para encaixar saudação, ex.: "Olá{{contato}}!") e {{remetente}} (seu nome). Não invente nomes de pessoas.
- Não inclua linha de opt-out nem assinatura formal.
- Entregue variações realmente diferentes entre si na abertura e no ângulo.

Responda exclusivamente em JSON válido: {"variants":[{"text":"..."}]}.`;

const messageSchema = z.object({ variants: z.array(z.object({ text: z.string().min(10).max(1500) })).min(1).max(3) });

export type MessageVariant = { text: string; warnings: string[] };

export async function generateMessageVariants(
  ctx: Ctx,
  input: {
    dealId?: string | null;
    companyId?: string | null;
    contactId?: string | null;
    objective: string;
    service?: string | null;
    tone: string;
    length?: MessageLengthId;
    observation?: string | null;
    useFacts?: string[];
    count?: number;
    sender: string;
    optOut: boolean;
    consent: boolean;
  },
): Promise<MessageVariant[]> {
  assertWrite(ctx);
  assertModule(ctx, "comercial");
  if (!input.consent) throw new ValidationError("Autorize o envio ao Gemini para gerar com IA.");
  assertAiEnabled();
  const mc = await messageContext(ctx, input);
  if (mc.blocked) throw new ValidationError(mc.blockedReason ?? "Contato bloqueado.");
  const obj = labelOf(MESSAGE_OBJECTIVES, input.objective);
  const tone = labelOf(MESSAGE_TONES, input.tone);
  const lengthId: MessageLengthId = input.length && MESSAGE_LENGTHS.some((l) => l.id === input.length) ? input.length : "media";
  const lengthSpec = MESSAGE_LENGTHS.find((l) => l.id === lengthId)!;
  const facts = [...(input.useFacts ?? mc.facts)].map((f) => sanitizeForAi(f, { maxLen: 200 })).filter(Boolean);
  const obs = sanitizeForAi(input.observation, { maxLen: 300 });
  if (obs) facts.push(obs);

  const presenceParts = [
    mc.presence.siteType ? `status do site: ${mc.presence.siteType}` : mc.presence.website ? "tem site cadastrado" : "sem site cadastrado",
    mc.presence.psiPerformance != null ? `desempenho móvel (PageSpeed): ${mc.presence.psiPerformance}/100` : null,
    mc.presence.viewport === false ? "site com problema de visualização no celular" : null,
    mc.presence.hasBooking === false ? "agendamento online não detectado no site" : null,
    mc.presence.instagram ? "tem Instagram informado" : null,
  ].filter(Boolean);

  const historyLines = mc.recentHistory
    .slice(0, 5)
    .reverse()
    .map((h) => `- ${h.kind}${h.channel ? ` (${h.channel})` : ""}: ${sanitizeForAi(h.content?.replaceAll(mc.companyName, "[empresa]"), { maxLen: 180 })}`)
    .filter((line) => !line.endsWith(": "));

  const user = [
    `Objetivo da mensagem: ${obj}`,
    `Serviço oferecido: ${sanitizeForAi(input.service ?? mc.serviceType ?? "site profissional", { maxLen: 80 })}`,
    `Tom: ${tone}`,
    `Tamanho desejado: ${lengthSpec.id} (${lengthSpec.hint})`,
    `Negócio: ${sanitizeForAi(mc.companyName, { maxLen: 80 })}${mc.category ? ` (${sanitizeForAi(mc.category, { maxLen: 40 })}` + (mc.city ? `, ${sanitizeForAi(mc.city, { maxLen: 40 })}` : "") + ")" : ""}`,
    mc.dealStageLabel ? `Etapa atual no CRM: ${mc.dealStageLabel}` : null,
    mc.nextStep ? `Próximo passo planejado: ${sanitizeForAi(mc.nextStep, { maxLen: 120 })}` : null,
    `Presença digital: ${presenceParts.join(" | ")}`,
    `Origem (só citar se fizer sentido no primeiro contato): ${mc.origin ? sanitizeForAi(mc.origin, { maxLen: 160 }) : "não informar"}`,
    `Fatos verificados:${facts.length ? facts.map((f) => `\n- ${f}`).join("") : "\n- nenhum fato extra informado"}`,
    `Histórico recente com este lead:${historyLines.length ? "\n" + historyLines.join("\n") : "\n- nenhuma interação registrada ainda"}`,
    `Quantidade de variações: ${Math.min(Math.max(input.count ?? 3, 1), 3)}`,
  ]
    .filter(Boolean)
    .join("\n");

  const out = await generateJson(ctx, "mensagem", { system: MESSAGE_SYSTEM, user, schema: messageSchema, temperature: 0.75, maxOutputTokens: 1200 });
  const vars = varsFor(mc, { sender: input.sender, service: input.service, observation: input.observation });
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
  assertModule(ctx, "comercial");
  if (!consent) throw new ValidationError("Autorize o envio ao Gemini para usar a IA.");
  assertAiEnabled();
  const { text } = await dealDigest(ctx, dealId);
  return generateJson(ctx, "resumo", { system: DEAL_SYSTEM, user: `${text}\n\nFaça um resumo da situação em até 4 frases e liste até 3 pontos de atenção. JSON: {"resumo":"...","pontos_de_atencao":["..."]}`, schema: summarySchema, temperature: 0.3 });
}

const nextSchema = z.object({ acao: z.string().max(240), motivo: z.string().max(400), canal_sugerido: z.enum(["whatsapp", "ligacao", "email", "reuniao", "nenhum"]), prazo_dias: z.number().int().min(0).max(30) });
export async function suggestNextAction(ctx: Ctx, dealId: string, consent: boolean) {
  assertModule(ctx, "comercial");
  if (!consent) throw new ValidationError("Autorize o envio ao Gemini para usar a IA.");
  assertAiEnabled();
  const { text } = await dealDigest(ctx, dealId);
  return generateJson(ctx, "proxima_acao", { system: DEAL_SYSTEM, user: `${text}\n\nSugira UMA próxima ação concreta. JSON: {"acao":"...","motivo":"...","canal_sugerido":"whatsapp|ligacao|email|reuniao|nenhum","prazo_dias":3}`, schema: nextSchema, temperature: 0.4 });
}

const tasksSchema = z.object({ tarefas: z.array(z.object({ titulo: z.string().max(140), prazo_dias: z.number().int().min(0).max(30), prioridade: z.enum(["baixa", "media", "alta"]) })).min(1).max(5) });
export async function suggestTasks(ctx: Ctx, dealId: string, consent: boolean) {
  assertModule(ctx, "comercial");
  if (!consent) throw new ValidationError("Autorize o envio ao Gemini para usar a IA.");
  assertAiEnabled();
  const { text } = await dealDigest(ctx, dealId);
  return generateJson(ctx, "tarefas", { system: DEAL_SYSTEM, user: `${text}\n\nSugira de 1 a 4 tarefas curtas e verificáveis que ainda não existam na lista. JSON: {"tarefas":[{"titulo":"...","prazo_dias":2,"prioridade":"media"}]}`, schema: tasksSchema, temperature: 0.4 });
}
