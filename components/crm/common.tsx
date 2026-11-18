import { Badge } from "@/components/ui/kit";
import { BAND_COLOR, bandOf } from "@/components/lead/badges";

export function StageBadge({ kind, label }: { kind: string; label: string }) {
  return <Badge tone={kind === "won" ? "ok" : kind === "lost" ? "danger" : "brand"}>{label}</Badge>;
}

/** Lead Score do Radar (cor + número, nunca só cor). */
export function ScorePill({ score }: { score: number | null }) {
  if (score == null) return null;
  const band = bandOf(score);
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums" style={{ background: `${BAND_COLOR[band]}22`, color: BAND_COLOR[band] }} title={`Lead Score ${score} (${band})`}>
      {score} · {band}
    </span>
  );
}

export const tagList = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean);
