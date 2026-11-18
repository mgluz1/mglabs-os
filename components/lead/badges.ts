import { getCategory } from "@/lib/config/categories";
import { BANDS } from "@/lib/config/score";
import type { RadarPlace } from "@/lib/types";

export type Badge = { label: string; tone: "red" | "amber" | "sky" | "slate" };

export function badgesFor(p: RadarPlace): Badge[] {
  const b: Badge[] = [];
  if (p.siteType === "sem_site") b.push({ label: "Sem site", tone: "red" });
  if (p.siteType === "so_rede_social") b.push({ label: "Só Instagram", tone: "red" });
  if (p.psiPerformance != null && p.psiPerformance < 50) b.push({ label: "Site lento", tone: "amber" });
  if (p.viewport === false) b.push({ label: "Não responsivo", tone: "amber" });
  const cat = p.category ? getCategory(p.category) : undefined;
  if (cat?.agenda && p.auditStatus === "done" && !p.hasBooking) b.push({ label: "Sem agendamento", tone: "sky" });
  if (p.oldSite.length) b.push({ label: "Site antigo", tone: "amber" });
  return b;
}

export function bandOf(score: number | null): "quente" | "morno" | "frio" | "analisando" {
  if (score == null) return "analisando";
  return score >= BANDS.quente ? "quente" : score >= BANDS.morno ? "morno" : "frio";
}

export const BAND_COLOR = {
  quente: "#22c55e",
  morno: "#eab308",
  frio: "#64748b",
  analisando: "#7c9cff",
} as const;

export const TONE_CLASS: Record<Badge["tone"], string> = {
  red: "bg-danger/15 text-danger ring-danger/30",
  amber: "bg-warn/15 text-warn ring-warn/30",
  sky: "bg-info/15 text-info ring-info/30",
  slate: "bg-muted/15 text-muted ring-muted/30",
};
