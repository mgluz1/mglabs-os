import "server-only";

export type PsiResult = { performance: number | null; seo: number | null };

/** PageSpeed Insights (mobile). Falhas viram null: a análise segue sem a nota. */
export async function pageSpeed(url: string): Promise<PsiResult> {
  const key = process.env.PAGESPEED_API_KEY;
  if (!key) return { performance: null, seo: null };
  const q = new URLSearchParams({ url, strategy: "mobile", key });
  q.append("category", "performance");
  q.append("category", "seo");
  try {
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, {
      signal: AbortSignal.timeout(35_000),
      cache: "no-store",
    });
    if (!res.ok) return { performance: null, seo: null };
    const j = (await res.json()) as {
      lighthouseResult?: { categories?: Record<string, { score: number | null }> };
    };
    const cat = j.lighthouseResult?.categories ?? {};
    const pct = (s?: number | null) => (s == null ? null : Math.round(s * 100));
    return { performance: pct(cat.performance?.score), seo: pct(cat.seo?.score) };
  } catch {
    return { performance: null, seo: null };
  }
}
