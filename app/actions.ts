"use server";

import { sql } from "drizzle-orm";
import { after } from "next/server";

import { act, UserError } from "@/lib/actions/helpers";
import { processAuditBatch, requeueFailedAudits } from "@/lib/audit/process";
import { resolveOfferService } from "@/lib/config/crm";
import { db } from "@/lib/db";
import { parseBrPhone } from "@/lib/phone";
import { loadMoreSearchResults, runSearch, type SearchOutcome } from "@/lib/places/search";
import { placeById } from "@/lib/queries";
import { timelineFor } from "@/lib/services/activities";
import { assertModule, assertWrite, requireCtx } from "@/lib/services/ctx";
import { addPlaceToCrm } from "@/lib/services/deals";
import { registerOptOut } from "@/lib/services/optout";
import { setPlaceProspectState, type ProspectActionInput } from "@/lib/services/prospecting";
import type { Activity, RadarPlace } from "@/lib/types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

// ---------- Radar (descoberta) ----------

export async function searchAction(input: { category: string; lat: number; lng: number; radiusM: number; label?: string }): Promise<SearchOutcome> {
  try {
    const ctx = await requireCtx();
    assertModule(ctx, "comercial");
    if (![input.lat, input.lng, input.radiusM].every(Number.isFinite)) return { ok: false, error: "Centro ou raio inválido." };
    const out = await runSearch({ category: input.category, center: { lat: input.lat, lng: input.lng }, radiusM: input.radiusM, label: input.label });
    if (out.ok) after(() => processAuditBatch(5).catch((e) => console.error("audit", e)));
    return out;
  } catch (e) {
    console.error("search", e instanceof Error ? e.message : e);
    return { ok: false, error: e instanceof Error && e.message.length < 200 ? e.message : "Não foi possível buscar agora." };
  }
}

/** Painel do lugar: dados do Radar + histórico da oportunidade no CRM (se já foi adicionado). */
export async function leadDetailAction(placeId: string): Promise<Result<{ place: RadarPlace; activities: Activity[] }>> {
  return act(async (ctx) => {
    assertModule(ctx, "comercial");
    const place = await placeById(placeId, ctx.workspaceId);
    if (!place) throw new Error("Lugar não encontrado.");
    const tl = place.leadId ? await timelineFor(ctx, { dealId: place.leadId }, 30) : [];
    return { place, activities: tl.map((a) => ({ id: a.id, kind: a.kind, channel: a.channel, content: a.content, createdAt: a.occurredAt.toISOString() })) };
  }).then((r) => (r.ok ? r : { ok: false as const, error: r.error === "Algo deu errado. Tente novamente em instantes." ? "Lugar não encontrado." : r.error }));
}

/** Botão "Escrever mensagem": garante empresa + oportunidade no CRM (com a oferta selecionada) e devolve os ids para abrir o Estúdio. */
export async function openInStudioAction(placeId: string, offer?: string | null): Promise<Result<{ companyId: string; dealId: string; serviceType: string | null }>> {
  return act(async (ctx) => {
    const serviceType = resolveOfferService(offer);
    const r = await addPlaceToCrm(ctx, placeId, { serviceType });
    return { companyId: r.companyId, dealId: r.dealId, serviceType };
  });
}

/** Carrega mais resultados (> 600) de uma busca parcial no Radar. */
export async function loadMoreRadarAction(searchId: string): Promise<Result<{ added: number; hasMore: boolean }>> {
  return act(async (ctx) => {
    assertModule(ctx, "comercial");
    if (!/^[0-9a-f-]{36}$/i.test(searchId)) throw new UserError("Busca inválida.");
    const r = await loadMoreSearchResults(searchId);
    if (!r.ok) throw new UserError(r.error);
    if (r.added > 0) after(() => processAuditBatch(5).catch((e) => console.error("audit", e)));
    return { added: r.added, hasMore: r.hasMore };
  });
}

/** Reenfileira auditorias que falharam por erro recuperável. */
export async function retryAuditsAction(placeIds: string[]): Promise<Result<{ requeued: number }>> {
  return act(async (ctx) => {
    assertWrite(ctx);
    assertModule(ctx, "comercial");
    const requeued = await requeueFailedAudits(placeIds);
    return { requeued };
  });
}

/** Ações rápidas de prospecção no Radar: ignorar, adiar, restaurar ou marcar contato realizado. */
export async function prospectStateAction(placeId: string, input: ProspectActionInput) {
  return act((ctx) =>
    setPlaceProspectState(
      ctx,
      placeId,
      input.action === "contatado" ? { ...input, offer: resolveOfferService(input.offer) } : input,
    ),
  );
}

/** "Não contatar mais" a partir do Radar. Vale para o lugar mesmo que ainda não esteja no CRM. */
export async function optOutAction(placeId: string, reason: string): Promise<Result<true>> {
  return act(async (ctx) => {
    assertWrite(ctx);
    assertModule(ctx, "comercial");
    const place = await placeById(placeId, ctx.workspaceId);
    if (!place) throw new Error("Lugar não encontrado.");
    if (place.companyId) {
      await registerOptOut(ctx, { companyId: place.companyId, reason });
      return true as const;
    }
    const phones = new Set<string>();
    for (const c of place.contacts) if (c.kind === "whatsapp" || c.kind === "phone") phones.add(parseBrPhone(c.value)?.e164 ?? c.value);
    const gp = parseBrPhone(place.googlePhone);
    if (gp) phones.add(gp.e164);
    await db.execute(sql`insert into optouts (google_place_id, overture_id, phone, reason) values (${place.googlePlaceId}, ${place.overtureId}, null, ${reason || null})`);
    for (const ph of phones) await db.execute(sql`insert into optouts (google_place_id, overture_id, phone, reason) values (${place.googlePlaceId}, ${place.overtureId}, ${ph}, ${reason || null})`);
    return true as const;
  });
}

// ---------- Base aberta (Overture) ----------

export async function importOvertureAction(): Promise<Result<{ release: string; rows: number; removed: number; ms: number }>> {
  return act(async (ctx) => {
    const { importOvertureAsAdmin } = await import("@/lib/overture/import");
    const r = await importOvertureAsAdmin(ctx);
    if (!r.ok) throw new UserError(r.error);
    return { release: r.release, rows: r.rows, removed: r.removed, ms: r.ms };
  });
}
