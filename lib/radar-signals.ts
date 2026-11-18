import { getCategory } from "@/lib/config/categories";
import type { RadarPlace } from "@/lib/types";

/** Sinais observados (fatos auditados) de um lugar do Radar, em linguagem natural. Sem inventar nada. */
export function signalsFor(place: RadarPlace): string[] {
  const out: string[] = [];
  if (place.siteType === "sem_site") out.push("não foi encontrado site próprio nos dados abertos");
  if (place.siteType === "so_rede_social") out.push("usa só Instagram/WhatsApp como site");
  if (place.viewport === false) out.push("o site não se adapta ao celular");
  if (place.psiPerformance != null && place.psiPerformance < 50) out.push("o site demora para abrir no celular");
  if (place.hasServicesPage === false) out.push("o site não mostra a lista de serviços");
  const cat = place.category ? getCategory(place.category) : null;
  if (cat?.agenda && place.hasBooking === false) out.push("não foi detectado agendamento online no site");
  for (const o of place.oldSite) out.push(`site com sinais de desatualizado (${o})`);
  return out.slice(0, 4);
}
