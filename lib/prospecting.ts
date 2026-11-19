import { getCategory } from "@/lib/config/categories";
import { contactCapabilities, signalsFor } from "@/lib/radar-signals";
import type { RadarPlace } from "@/lib/types";

export type ApproachStatus =
  | "nao_abordado"
  | "mensagem_preparada"
  | "contatado"
  | "respondeu"
  | "em_negociacao"
  | "ganho"
  | "perdido"
  | "adiado"
  | "ignorado";

export const APPROACH_STATUS_LABEL: Record<ApproachStatus, string> = {
  nao_abordado: "Não abordado",
  mensagem_preparada: "Mensagem preparada",
  contatado: "Contatado",
  respondeu: "Respondeu",
  em_negociacao: "Em negociação",
  ganho: "Fechado ganho",
  perdido: "Perdido",
  adiado: "Adiado",
  ignorado: "Ignorado",
};

export function isSnoozed(place: Pick<RadarPlace, "snoozedUntil">, nowMs = Date.now()): boolean {
  if (!place.snoozedUntil) return false;
  const t = Date.parse(place.snoozedUntil);
  return Number.isFinite(t) && t > nowMs;
}

export function isHiddenFromQueue(place: Pick<RadarPlace, "optedOut" | "ignored" | "snoozedUntil">, nowMs = Date.now()): boolean {
  return place.optedOut || place.ignored || isSnoozed(place, nowMs);
}

export function deriveApproachStatus(place: Pick<RadarPlace, "ignored" | "snoozedUntil" | "leadStage" | "hasDraft">, nowMs = Date.now()): ApproachStatus {
  if (place.ignored) return "ignorado";
  if (isSnoozed(place, nowMs)) return "adiado";
  if (place.leadStage === "ganho") return "ganho";
  if (place.leadStage === "perdido") return "perdido";
  if (place.leadStage === "reuniao" || place.leadStage === "proposta" || place.leadStage === "negociacao") return "em_negociacao";
  if (place.leadStage === "conversa") return "respondeu";
  if (place.leadStage === "primeiro_contato" || place.leadStage === "abordado") return "contatado";
  if (place.hasDraft) return "mensagem_preparada";
  return "nao_abordado";
}

export type QueueItem = {
  place: RadarPlace;
  priority: number;
  status: ApproachStatus;
  reasons: string[];
};

/**
 * Pontuação determinística para a fila diária de prospecção (sem depender de IA).
 * Retorna null quando o lead não deve entrar na fila de abordagem agora.
 */
export function evaluateProspectCandidate(
  place: RadarPlace,
  opts: { offer?: string | null; nowMs?: number } = {},
): QueueItem | null {
  const nowMs = opts.nowMs ?? Date.now();
  if (isHiddenFromQueue(place, nowMs)) return null;
  if (place.score == null) return null;

  const status = deriveApproachStatus(place, nowMs);
  if (status !== "nao_abordado" && status !== "mensagem_preparada") return null;

  const cap = contactCapabilities(place);
  if (!cap.hasUsableContact) return null;

  let priority = place.score;
  const reasons: string[] = [];

  if (cap.hasConfirmedWhatsapp) {
    priority += 15;
    reasons.push("WhatsApp confirmado");
  } else if (cap.hasMobile) {
    priority += 8;
    reasons.push("Celular disponível");
  } else {
    reasons.push("Contato disponível");
  }

  const sigs = signalsFor(place);
  if (sigs.length > 0) {
    priority += 10;
    reasons.push(sigs[0]);
  }

  const cat = place.category ? getCategory(place.category) : null;
  if (opts.offer === "agendamento" && cat?.agenda && place.hasBooking === false) {
    priority += 8;
    reasons.push("Encaixe com agendamento");
  } else if ((opts.offer === "site" || opts.offer === "landing") && (place.siteType === "sem_site" || place.siteType === "so_rede_social" || place.viewport === false)) {
    priority += 8;
    reasons.push("Encaixe com site profissional");
  } else if (opts.offer === "servicos_mglabs" && ((cat?.agenda && place.hasBooking === false) || cap.hasMobile || place.siteType === "sem_site" || place.siteType === "so_rede_social")) {
    priority += 8;
    reasons.push("Encaixe com Serviços MGLABS");
  } else if (opts.offer === "automacao_whatsapp" && cap.hasMobile) {
    priority += 6;
    reasons.push("Encaixe com automação WhatsApp");
  }

  if ((place.confidence ?? 0) >= 0.85 || (place.ratingCount ?? 0) >= 30) {
    priority += 5;
    reasons.push("Alta confiança nos dados");
  }

  if (status === "mensagem_preparada") {
    priority += 4;
    reasons.push("Rascunho já preparado");
  }

  return { place, priority, status, reasons: reasons.slice(0, 3) };
}

export function buildProspectQueue(
  places: RadarPlace[],
  opts: { offer?: string | null; limit?: number; nowMs?: number } = {},
): QueueItem[] {
  const limit = opts.limit ?? 8;
  const items: QueueItem[] = [];
  for (const p of places) {
    const item = evaluateProspectCandidate(p, opts);
    if (item) items.push(item);
  }
  items.sort((a, b) => b.priority - a.priority || (b.place.score ?? 0) - (a.place.score ?? 0));
  return items.slice(0, limit);
}
