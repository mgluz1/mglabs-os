import { getCategory } from "@/lib/config/categories";
import { BANDS } from "@/lib/config/score";
import { parseBrPhone } from "@/lib/phone";
import type { RadarPlace } from "@/lib/types";

/** Sinais observados (fatos auditados) de um lugar do Radar, em linguagem natural. Sem inventar nada. */
export function signalsFor(place: RadarPlace): string[] {
  const out: string[] = [];
  if (place.siteType === "sem_site") out.push("não foi encontrado site nos dados consultados");
  if (place.siteType === "so_rede_social") out.push("usa apenas rede social/WhatsApp como endereço web nos dados consultados");
  if (place.auditStatus === "done") {
    if (place.viewport === false) out.push("o site não apresentou adaptação para celular na auditoria");
    if (place.psiPerformance != null && place.psiPerformance < 50) out.push(`o site teve desempenho baixo no celular (PageSpeed ${place.psiPerformance})`);
    if (place.hasServicesPage === false) out.push("não foi detectada página de serviços no site auditado");
    const cat = place.category ? getCategory(place.category) : null;
    if (cat?.agenda && place.hasBooking === false) out.push("não foi detectado agendamento online no site auditado");
    for (const o of place.oldSite) out.push(`site com sinais de desatualizado (${o})`);
  }
  return out.slice(0, 4);
}

export type ContactCapabilities = {
  hasConfirmedWhatsapp: boolean;
  hasMobile: boolean;
  hasLandline: boolean;
  hasEmail: boolean;
  hasInstagram: boolean;
  hasUsableContact: boolean;
};

/** Separa canais utilizáveis e diferencia WhatsApp confirmado de celular comum. */
export function contactCapabilities(place: RadarPlace): ContactCapabilities {
  if (place.optedOut) {
    return { hasConfirmedWhatsapp: false, hasMobile: false, hasLandline: false, hasEmail: false, hasInstagram: false, hasUsableContact: false };
  }
  const hasConfirmedWhatsapp = place.contacts.some((c) => c.kind === "whatsapp" && c.confirmed);
  const gp = parseBrPhone(place.googlePhone);
  const hasMobile =
    hasConfirmedWhatsapp ||
    Boolean(gp?.mobile) ||
    place.contacts.some((c) => c.kind === "whatsapp" || (c.kind === "phone" && Boolean(parseBrPhone(c.value)?.mobile)));
  const hasLandline =
    Boolean(gp && !gp.mobile) ||
    place.contacts.some((c) => c.kind === "phone" && !parseBrPhone(c.value)?.mobile);
  const hasEmail = place.contacts.some((c) => c.kind === "email");
  const hasInstagram = place.contacts.some((c) => c.kind === "instagram");
  const hasUsableContact = hasConfirmedWhatsapp || hasMobile || hasLandline || hasEmail || hasInstagram;
  return { hasConfirmedWhatsapp, hasMobile, hasLandline, hasEmail, hasInstagram, hasUsableContact };
}

export function isPriorityLead(place: RadarPlace): boolean {
  return (place.score ?? 0) >= BANDS.quente && contactCapabilities(place).hasUsableContact;
}

export function isNextApproachable(place: RadarPlace, nowMs = Date.now()): boolean {
  if (place.score == null) return false;
  if (place.ignored) return false;
  if (place.snoozedUntil && Date.parse(place.snoozedUntil) > nowMs) return false;
  if (!contactCapabilities(place).hasUsableContact) return false;
  return !place.leadStage || place.leadStage === "novo" || place.leadStage === "qualificado";
}

/** Backoff progressivo para polling de auditorias (null = pausar após falhas seguidas). */
export function nextPollDelayMs(consecutiveErrors: number): number | null {
  if (consecutiveErrors <= 0) return 3000;
  if (consecutiveErrors > 5) return null;
  const steps = [5000, 8000, 12000, 16000, 20000];
  return steps[Math.min(consecutiveErrors - 1, steps.length - 1)];
}
