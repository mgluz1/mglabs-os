import "server-only";

import pLimit from "p-limit";
import { sql } from "drizzle-orm";

import { analyzeHtml, classifySite, type HtmlSignals } from "@/lib/audit/analyze-html";
import { fetchHomepage } from "@/lib/audit/fetch-site";
import { pageSpeed } from "@/lib/audit/pagespeed";
import { db } from "@/lib/db";
import { parseBrPhone } from "@/lib/phone";
import { computeScore } from "@/lib/score";

type Claimed = {
  audit_id: string;
  place_id: string;
  url: string | null;
  category: string | null;
  rating: string | null;
  rating_count: number | null;
  google_phone: string | null;
  confidence: string | null;
  source_count: number | null;
};

/** Pega até `limit` análises pendentes sem colidir com outro lote (skip locked). */
async function claim(limit: number): Promise<Claimed[]> {
  // devolve à fila análises travadas há mais de 5 min
  await db.execute(sql`update site_audits set status = 'pending' where status = 'running' and audited_at < now() - interval '5 minutes'`);
  const { rows } = await db.execute<Claimed>(sql`
    with picked as (
      select id from site_audits where status = 'pending'
      order by audited_at nulls first limit ${limit}
      for update skip locked
    )
    update site_audits a set status = 'running', audited_at = now()
    from picked, places p
    where a.id = picked.id and p.id = a.place_id
    returning a.id as audit_id, a.place_id, a.url, p.category, p.rating::text as rating, p.rating_count,
              coalesce(p.phone, p.google_phone) as google_phone, p.confidence::text as confidence, p.source_count`);
  return rows;
}

async function auditOne(c: Claimed): Promise<void> {
  const siteType = classifySite(c.url);
  let signals: HtmlSignals | null = null;
  let psi = { performance: null as number | null, seo: null as number | null };
  let fetchError: string | null = null;

  if (siteType === "site_proprio" && c.url) {
    const [page, ps] = await Promise.all([fetchHomepage(c.url), pageSpeed(c.url)]);
    psi = ps;
    if (page.ok) signals = analyzeHtml(page.html, page.finalUrl);
    else fetchError = page.reason;
  }

  // contatos que a própria empresa publicou no site (podem ser guardados)
  const contacts: { kind: string; value: string; confirmed: boolean; stored?: boolean }[] = [];
  if (signals) {
    for (const v of signals.contacts.whatsapp) contacts.push({ kind: "whatsapp", value: v, confirmed: true });
    for (const v of signals.contacts.phones) contacts.push({ kind: "phone", value: v, confirmed: false });
    for (const v of signals.contacts.emails) contacts.push({ kind: "email", value: v, confirmed: false });
    for (const v of signals.contacts.instagram) contacts.push({ kind: "instagram", value: v, confirmed: false });
    for (const v of signals.contacts.facebook) contacts.push({ kind: "facebook", value: v, confirmed: false });
  }
  // "site" que é rede social: guarda o link como Instagram/WhatsApp
  if (siteType === "so_rede_social" && c.url) {
    if (/instagram\.com/i.test(c.url)) contacts.push({ kind: "instagram", value: c.url, confirmed: false });
    const wa = c.url.match(/wa\.me\/(\d+)|phone=(\d+)/);
    const p = wa ? parseBrPhone(wa[1] ?? wa[2]) : null;
    if (p) contacts.push({ kind: "whatsapp", value: p.e164, confirmed: true });
  }

  // contatos já guardados para o lugar (ex.: vindos do Overture)
  const { rows: stored } = await db.execute<{ kind: string; value: string }>(sql`select kind, value from place_contacts where place_id = ${c.place_id}`);
  for (const x of stored) if (!contacts.some((y) => y.kind === x.kind && y.value === x.value)) contacts.push({ ...x, confirmed: false, stored: true });
  const googlePhone = parseBrPhone(c.google_phone);
  const hasMobileOrWhatsapp = Boolean(googlePhone?.mobile) || contacts.some((x) => x.kind === "whatsapp" || (x.kind === "phone" && parseBrPhone(x.value)?.mobile));
  const score = computeScore({
    category: c.category,
    siteType,
    https: signals?.https ?? (siteType === "site_proprio" && c.url ? c.url.startsWith("https://") : null),
    viewport: signals?.viewport ?? null,
    psiPerformance: psi.performance,
    hasServicesPage: signals ? signals.hasServicesPage : null,
    seoBasicMissing: signals?.seoBasicMissing ?? null,
    hasWhatsappButton: signals ? signals.hasWhatsappButton : null,
    hasTelLink: signals ? signals.hasTelLink : null,
    hasBooking: signals?.hasBooking ?? false,
    hasMenu: signals?.hasMenu ?? false,
    rating: c.rating == null ? null : Number(c.rating),
    ratingCount: c.rating_count,
    confidence: c.confidence == null ? null : Number(c.confidence),
    sourceCount: c.source_count,
    hasMobileOrWhatsapp,
    hasEmail: contacts.some((x) => x.kind === "email"),
    hasInstagram: contacts.some((x) => x.kind === "instagram"),
    hasAnyContact: Boolean(googlePhone) || contacts.some((x) => ["whatsapp", "phone", "email", "instagram"].includes(x.kind)),
  });

  const signalsJson = signals
    ? { ...signals, contacts: undefined, fetchError, psiSeo: psi.seo }
    : { fetchError, psiSeo: psi.seo };

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      update site_audits set
        site_type = ${siteType}, https = ${signals?.https ?? null}, viewport = ${signals?.viewport ?? null},
        psi_performance = ${psi.performance}, psi_seo = ${psi.seo},
        has_services_page = ${signals?.hasServicesPage ?? null}, has_booking = ${signals?.hasBooking ?? null},
        has_whatsapp_button = ${signals?.hasWhatsappButton ?? null},
        signals = ${JSON.stringify(signalsJson)}::jsonb, approachable = ${score.approachable},
        status = 'done', error = ${fetchError}, audited_at = now()
      where id = ${c.audit_id}`);
    const fresh = contacts.filter((x) => !x.stored);
    if (fresh.length) {
      await tx.execute(sql`
        insert into place_contacts (place_id, kind, value, source, confirmed)
        select ${c.place_id}::uuid, r.kind, r.value, 'site_empresa', r.confirmed
        from jsonb_to_recordset(${JSON.stringify(fresh.map(({ kind, value, confirmed }) => ({ kind, value, confirmed })))}::jsonb) as r(kind text, value text, confirmed boolean)
        on conflict (place_id, kind, value) do update set confirmed = place_contacts.confirmed or excluded.confirmed, collected_at = now()`);
    }
    await tx.execute(sql`
      insert into lead_scores (place_id, total, block_a, block_b, block_c, block_d, rules, weights_version, scored_at)
      values (${c.place_id}, ${score.total}, ${score.blockA}, ${score.blockB}, ${score.blockC}, ${score.blockD},
              ${JSON.stringify(score.rules)}::jsonb, ${score.weightsVersion}, now())
      on conflict (place_id) do update set total = excluded.total, block_a = excluded.block_a, block_b = excluded.block_b,
        block_c = excluded.block_c, block_d = excluded.block_d, rules = excluded.rules,
        weights_version = excluded.weights_version, scored_at = now()`);
  });
}

/** Processa um lote. Cabe em ~50 s: concorrência 4, timeouts de 10 s (site) e 35 s (PageSpeed). */
export async function processAuditBatch(limit = 5): Promise<{ processed: number; failed: number; pending: number }> {
  const claimed = await claim(limit);
  const run = pLimit(4);
  let failed = 0;
  await Promise.all(
    claimed.map((c) =>
      run(async () => {
        try {
          await auditOne(c);
        } catch (e) {
          failed++;
          const msg = e instanceof Error ? e.message : String(e);
          await db.execute(sql`update site_audits set status = 'error', error = ${msg.slice(0, 300)} where id = ${c.audit_id}`);
        }
      }),
    ),
  );
  const { rows } = await db.execute<{ n: number }>(sql`select count(*)::int as n from site_audits where status in ('pending', 'running')`);
  return { processed: claimed.length - failed, failed, pending: rows[0]?.n ?? 0 };
}
