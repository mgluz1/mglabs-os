// "Qual é a próxima mensagem?" — decisão determinística a partir da etapa e do histórico (sem IA).
import type { ObjectiveId } from "@/lib/config/crm";

export type PlanHistoryItem = { kind: string; occurredAt: Date | string };
export type MessagePlan = {
  objective: ObjectiveId;
  /** Frase curta para mostrar ao usuário. */
  reason: string;
  /** Há resposta do cliente ainda sem retorno nosso. */
  awaitingReply: boolean;
  /** Dias desde o último envio nosso sem resposta (null se não houver envio ou já houve resposta). */
  waitingDays: number | null;
  /** 0 = urgente (cliente esperando) … 3 = baixa. Usado para ordenar a fila. */
  priority: 0 | 1 | 2 | 3;
};

const DAY = 86_400_000;
const days = (a: Date, b: Date) => Math.max(0, Math.floor((b.getTime() - a.getTime()) / DAY));
const at = (d: Date | string) => (d instanceof Date ? d : new Date(d));

export function planMessage(input: { stageKey: string | null; history: PlanHistoryItem[]; now?: Date; followUpAfterDays?: number }): MessagePlan {
  const now = input.now ?? new Date();
  const after = input.followUpAfterDays ?? 2;
  const stage = input.stageKey ?? "novo";
  const hist = [...input.history].map((h) => ({ kind: h.kind, t: at(h.occurredAt) })).sort((a, b) => b.t.getTime() - a.t.getTime());
  const lastSent = hist.find((h) => h.kind === "mensagem_enviada");
  const lastReply = hist.find((h) => h.kind === "resposta");
  const lastAny = hist[0];

  if (stage === "ganho") return { objective: "pos_venda", reason: "Negócio fechado: hora de acompanhar o pós-venda.", awaitingReply: false, waitingDays: null, priority: 3 };
  if (stage === "perdido") return { objective: "reativacao", reason: "Negócio perdido: só reativar se fizer sentido e o contato permitir.", awaitingReply: false, waitingDays: null, priority: 3 };

  // cliente respondeu e ainda não retornamos
  if (lastReply && (!lastSent || lastReply.t.getTime() >= lastSent.t.getTime())) {
    const d = days(lastReply.t, now);
    const obj: ObjectiveId = stage === "proposta" ? "apresentacao_proposta" : stage === "negociacao" ? "negociacao" : "resposta_interesse";
    return { objective: obj, reason: d === 0 ? "O cliente respondeu hoje — responda enquanto está quente." : `O cliente respondeu há ${d} dia${d > 1 ? "s" : ""} e está sem retorno.`, awaitingReply: true, waitingDays: null, priority: 0 };
  }

  if (stage === "negociacao") return { objective: "negociacao", reason: "Em negociação: alinhe condições e próximos passos.", awaitingReply: false, waitingDays: lastSent ? days(lastSent.t, now) : null, priority: 1 };
  if (stage === "proposta") {
    const d = lastAny ? days(lastAny.t, now) : 0;
    return d >= after
      ? { objective: "follow_up", reason: `Proposta sem retorno há ${d} dias: faça um follow-up leve.`, awaitingReply: false, waitingDays: d, priority: 1 }
      : { objective: "apresentacao_proposta", reason: "Etapa de proposta: apresente ou reforce o que foi combinado.", awaitingReply: false, waitingDays: d, priority: 2 };
  }

  if (lastSent) {
    const d = days(lastSent.t, now);
    if (d >= 30) return { objective: "reativacao", reason: `Sem resposta há ${d} dias: tente reativar com um ângulo novo.`, awaitingReply: false, waitingDays: d, priority: 3 };
    if (d >= after) return { objective: "follow_up", reason: `Você mandou mensagem há ${d} dias e não houve resposta: faça um follow-up.`, awaitingReply: false, waitingDays: d, priority: 1 };
    return { objective: "follow_up", reason: "Mensagem enviada há pouco: espere um pouco antes de insistir.", awaitingReply: false, waitingDays: d, priority: 3 };
  }
  return { objective: "primeiro_contato", reason: "Ainda não abordado: comece com um primeiro contato curto e personalizado.", awaitingReply: false, waitingDays: null, priority: 2 };
}

/** Item pronto, ordenável. Menor `rank` = mais urgente; dentro do mesmo grupo, maior nota primeiro. */
export function queueRank(plan: MessagePlan, score: number | null): number {
  return plan.priority * 1000 - (score ?? 0) - (plan.waitingDays ?? 0);
}
