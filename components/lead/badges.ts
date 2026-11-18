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
  analisando: "#38bdf8",
} as const;

export const TONE_CLASS: Record<Badge["tone"], string> = {
  red: "bg-red-500/15 text-red-300 ring-red-500/30",
  amber: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  sky: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  slate: "bg-slate-500/15 text-slate-300 ring-slate-500/30",
};
