import { FRANQUIAS } from "@/lib/config/franquias";

export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function isFranchise(name: string): boolean {
  const n = normalize(name);
  return FRANQUIAS.some((f) => n.includes(normalize(f)));
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = ` ${normalize(s).replace(/[^a-z0-9 ]/g, "")} `;
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** Coeficiente de Dice sobre bigramas (0–1). */
export function nameSimilarity(a: string, b: string): number {
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  let total = 0;
  for (const [g, n] of A) {
    total += n;
    inter += Math.min(n, B.get(g) ?? 0);
  }
  for (const n of B.values()) total += n;
  return total === 0 ? 0 : (2 * inter) / total;
}

/** "R. 9, 330 - St. Oeste, Goiânia - GO" → "St. Oeste" (melhor esforço; o Overture não traz bairro separado). */
export function neighborhoodFrom(address: string | null): string | null {
  if (!address) return null;
  const parts = address.split(" - ").map((p) => p.trim());
  if (parts.length < 2) return null;
  const cand = parts[1].split(",")[0].trim();
  if (!cand || /^\d/.test(cand) || /^(GO|Goiás)$/i.test(cand)) return null;
  return cand.length <= 40 ? cand : null;
}
