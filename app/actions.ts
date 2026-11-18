"use server";

import { sql } from "drizzle-orm";
import { after } from "next/server";

import { generateMessage, OFFERS, TONES, withOptOut, type OfferId, type ToneId } from "@/lib/ai/message";
import { processAuditBatch } from "@/lib/audit/process";
import { requireUser } from "@/lib/auth/require";
import { getCategory } from "@/lib/config/categories";
import { db } from "@/lib/db";
import { parseBrPhone } from "@/lib/phone";
import { placeDetails } from "@/lib/places/google";
import { runSearch, type SearchOutcome } from "@/lib/places/search";
import { reserveCalls } from "@/lib/quota";
import { activitiesFor, placeById } from "@/lib/queries";
import { STAGES, type Activity, type RadarPlace, type StageId } from "@/lib/types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  console.error(e);
  return { ok: false, error: e instanceof Error ? e.message : "Erro inesperado" };
}

// ---------- Radar ----------

export async function searchAction(input: {
  category: string;
  lat: number;
  lng: number;
  radiusM: number;
  label?: string;
}): Promise<SearchOutcome> {
  try {
    await requireUser();
    if (![input.lat, input.lng, input.radiusM].every(Number.isFinite)) return { ok: false, error: "Centro ou raio inválido." };
    const out = await runSearch({ category: input.category, center: { lat: input.lat, lng: input.lng }, radiusM: input.radiusM, label: input.label });
    if (out.ok) after(() => processAuditBatch(5).catch((e) => console.error("audit", e)));
    return out;
  } catch (e) {
    return fail(e);
  }
}

// ---------- Painel do lead ----------

export async function leadDetailAction(placeId: string): Promise<Result<{ place: RadarPlace; activities: Activity[] }>> {
  try {
    await requireUser();
    await refreshGoogleIfExpired(placeId);
    const place = await placeById(placeId);
    if (!place) return { ok: false, error: "Lugar não encontrado." };
    return { ok: true, data: { place, activities: place.leadId ? await activitiesFor(place.leadId) : [] } };
  } catch (e) {
    return fail(e);
  }
}

/** Cache do Google vencido → atualiza com Place Details (conta na cota). */
async function refreshGoogleIfExpired(placeId: string) {
  const { rows } = await db.execute<{ google_place_id: string; expired: boolean }>(
    sql`select google_place_id, (google_cached_until is null or google_cached_until < now()) as expired from places where id = ${placeId}`,
  );
  const r = rows[0];
  if (!r?.expired || !process.env.GOOGLE_PLACES_API_KEY) return;
  if (!(await reserveCalls("places:details"))) return;
  const p = await placeDetails(r.google_place_id);
  await db.execute(sql`
    update places set name = ${p.displayName?.text ?? null}, address = ${p.shortFormattedAddress ?? p.formattedAddress ?? null},
      rating = ${p.rating ?? null}, rating_count = ${p.userRatingCount ?? null}, business_status = ${p.businessStatus ?? null},
      google_phone = ${p.internationalPhoneNumber ?? p.nationalPhoneNumber ?? null}, google_website = ${p.websiteUri ?? null},
      google_maps_uri = ${p.googleMapsUri ?? null}, google_cached_until = now() + interval '30 days',
      geom = coalesce(${p.location ? `SRID=4326;POINT(${p.location.longitude} ${p.location.latitude})` : null}::geography, geom)
    where id = ${placeId}`);
}

function signalsFor(place: RadarPlace): string[] {
  const out: string[] = [];
  if (place.siteType === "sem_site") out.push("não tem site próprio");
  if (place.siteType === "so_rede_social") out.push("usa só Instagram/WhatsApp como site");
  if (place.viewport === false) out.push("o site não se adapta ao celular");
  if (place.psiPerformance != null && place.psiPerformance < 50) out.push("o site demora para abrir no celular");
  if (place.hasServicesPage === false) out.push("o site não mostra a lista de serviços");
  const cat = place.category ? getCategory(place.category) : null;
  if (cat?.agenda && place.hasBooking === false) out.push("o agendamento parece ser só pelo WhatsApp/telefone");
  if (cat?.agenda && place.hasBooking == null && place.siteType !== "site_proprio") out.push("não há agendamento online");
  if (place.ratingCount && place.ratingCount >= 30 && (place.rating ?? 0) >= 4.5)
    out.push(`tem ótima avaliação no Google (${place.rating?.toFixed(1)} com ${place.ratingCount} avaliações)`);
  for (const o of place.oldSite) out.push(`site com sinais de desatualizado (${o})`);
  return out.slice(0, 4);
}

export async function generateMessageAction(placeId: string, offer: OfferId, tone: ToneId): Promise<Result<string>> {
  try {
    await requireUser();
    if (!(offer in OFFERS) || !(tone in TONES)) return { ok: false, error: "Oferta ou tom inválido." };
    const place = await placeById(placeId);
    if (!place) return { ok: false, error: "Lugar não encontrado." };
    if (place.optedOut) return { ok: false, error: "Este negócio pediu para não ser contatado." };
    const text = await generateMessage({
      name: place.name,
      category: getCategory(place.category ?? "")?.label ?? place.category ?? "negócio",
      neighborhood: place.neighborhood,
      city: place.city,
      signals: signalsFor(place),
      offer,
      tone,
      myName: process.env.MEU_NOME || "Miguel",
    });
    return { ok: true, data: text };
  } catch (e) {
    return fail(e);
  }
}

async function ensureLead(placeId: string, stage: StageId = "novo"): Promise<string> {
  const { rows } = await db.execute<{ id: string }>(sql`
    insert into leads (place_id, stage) values (${placeId}, ${stage})
    on conflict (place_id) do update set updated_at = now()
    returning id`);
  return rows[0].id;
}

export async function addToCrmAction(placeIds: string[]): Promise<Result<number>> {
  try {
    await requireUser();
    let n = 0;
    for (const id of placeIds.slice(0, 200)) {
      const place = await placeById(id);
      if (!place || place.optedOut) continue;
      await ensureLead(id);
      n++;
    }
    return { ok: true, data: n };
  } catch (e) {
    return fail(e);
  }
}

/** Registrado depois que EU confirmo que enviei pelo meu WhatsApp. */
export async function markSentAction(placeId: string, channel: "whatsapp" | "ligacao" | "email" | "instagram", text: string): Promise<Result<string>> {
  try {
    await requireUser();
    const place = await placeById(placeId);
    if (!place) return { ok: false, error: "Lugar não encontrado." };
    if (place.optedOut) return { ok: false, error: "Este negócio pediu para não ser contatado." };
    const leadId = await ensureLead(placeId);
    await db.execute(sql`
      update leads set stage = case when stage = 'novo' then 'abordado' else stage end,
        next_step = 'Follow-up da primeira mensagem', next_step_at = now() + interval '3 days', updated_at = now()
      where id = ${leadId}`);
    await db.execute(sql`insert into activities (lead_id, kind, channel, content) values (${leadId}, 'mensagem_enviada', ${channel}, ${text.slice(0, 4000)})`);
    return { ok: true, data: leadId };
  } catch (e) {
    return fail(e);
  }
}

export async function optOutAction(placeId: string, reason: string): Promise<Result<true>> {
  try {
    await requireUser();
    const place = await placeById(placeId);
    if (!place) return { ok: false, error: "Lugar não encontrado." };
    const phones = new Set<string>();
    for (const c of place.contacts) if (c.kind === "whatsapp" || c.kind === "phone") phones.add(c.value);
    const gp = parseBrPhone(place.googlePhone);
    if (gp) phones.add(gp.e164);
    if (place.googlePhone) phones.add(place.googlePhone);
    await db.execute(sql`insert into optouts (google_place_id, phone, reason) values (${place.googlePlaceId}, null, ${reason || null})`);
    for (const ph of phones) await db.execute(sql`insert into optouts (google_place_id, phone, reason) values (${place.googlePlaceId}, ${ph}, ${reason || null})`);
    if (place.leadId) {
      await db.execute(sql`update leads set stage = 'perdido', lost_reason = 'Pediu para não ser contatado', next_step = null, next_step_at = null, updated_at = now() where id = ${place.leadId}`);
      await db.execute(sql`insert into activities (lead_id, kind, content) values (${place.leadId}, 'optout', ${reason || "Pediu para não ser contatado"})`);
    }
    return { ok: true, data: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------- CRM ----------

export async function moveStageAction(leadId: string, stage: StageId, lostReason?: string): Promise<Result<true>> {
  try {
    await requireUser();
    if (!STAGES.some((s) => s.id === stage)) return { ok: false, error: "Etapa inválida." };
    await db.execute(sql`
      update leads set stage = ${stage}, lost_reason = ${stage === "perdido" ? (lostReason ?? null) : null}, updated_at = now()
      where id = ${leadId}`);
    await db.execute(sql`insert into activities (lead_id, kind, content) values (${leadId}, 'etapa', ${`Movido para ${STAGES.find((s) => s.id === stage)!.label}${lostReason ? ` — ${lostReason}` : ""}`})`);
    return { ok: true, data: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateLeadAction(
  leadId: string,
  patch: { offer?: string | null; expectedValue?: number | null; nextStep?: string | null; nextStepAt?: string | null },
): Promise<Result<true>> {
  try {
    await requireUser();
    const at = patch.nextStepAt ? new Date(patch.nextStepAt) : null;
    if (at && Number.isNaN(at.getTime())) return { ok: false, error: "Data inválida." };
    await db.execute(sql`
      update leads set
        offer = coalesce(${patch.offer ?? null}, offer),
        expected_value = ${patch.expectedValue === undefined ? sql`expected_value` : patch.expectedValue},
        next_step = ${patch.nextStep === undefined ? sql`next_step` : patch.nextStep},
        next_step_at = ${patch.nextStepAt === undefined ? sql`next_step_at` : at?.toISOString() ?? null},
        updated_at = now()
      where id = ${leadId}`);
    return { ok: true, data: true };
  } catch (e) {
    return fail(e);
  }
}

export async function addActivityAction(leadId: string, kind: "nota" | "ligacao" | "resposta", content: string): Promise<Result<true>> {
  try {
    await requireUser();
    if (!content.trim()) return { ok: false, error: "Escreva algo." };
    await db.execute(sql`insert into activities (lead_id, kind, content) values (${leadId}, ${kind}, ${content.slice(0, 4000)})`);
    if (kind === "resposta") await db.execute(sql`update leads set stage = case when stage in ('novo','abordado') then 'respondeu' else stage end, updated_at = now() where id = ${leadId}`);
    return { ok: true, data: true };
  } catch (e) {
    return fail(e);
  }
}

export async function ensureOptOutLine(text: string): Promise<string> {
  return withOptOut(text);
}
