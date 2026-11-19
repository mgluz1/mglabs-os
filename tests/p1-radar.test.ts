import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveOfferService } from "@/lib/config/crm";
import { contactCapabilities, isNextApproachable, isPriorityLead, nextPollDelayMs, signalsFor } from "@/lib/radar-signals";
import type { RadarPlace } from "@/lib/types";

function makePlace(patch: Partial<RadarPlace> = {}): RadarPlace {
  return {
    id: "00000000-0000-0000-0000-000000000010",
    source: "overture",
    overtureId: "ov-1",
    googlePlaceId: null,
    confidence: 0.92,
    sourceCount: 2,
    name: "Barbearia Modelo",
    category: "barbearia",
    address: "Rua 1",
    neighborhood: "Bueno",
    city: "Goiânia",
    lat: -16.7,
    lng: -49.27,
    rating: null,
    ratingCount: null,
    googlePhone: null,
    googleWebsite: null,
    googleMapsUri: null,
    auditStatus: "done",
    auditError: null,
    auditedAt: "2026-11-18T12:00:00.000Z",
    scoredAt: "2026-11-18T12:00:00.000Z",
    siteType: "sem_site",
    https: null,
    viewport: null,
    psiPerformance: null,
    hasBooking: null,
    hasServicesPage: null,
    approachable: true,
    oldSite: [],
    score: 76,
    rules: [],
    contacts: [{ kind: "whatsapp", value: "+5562999991111", source: "overture", confirmed: false }],
    leadId: null,
    leadStage: null,
    companyId: null,
    ignored: false,
    snoozedUntil: null,
    hasDraft: false,
    optedOut: false,
    ...patch,
  };
}

describe("P1 — Sinais, linguagem e filtros do Radar", () => {
  it("não afirma 'sem site' nem emite defeitos HTML quando auditoria falhou", () => {
    const semSite = signalsFor(makePlace({ siteType: "sem_site", hasBooking: null }));
    expect(semSite).toEqual(["não foi encontrado site nos dados consultados"]);

    const erro = signalsFor(
      makePlace({
        siteType: "site_proprio",
        auditStatus: "error",
        viewport: false,
        hasBooking: false,
      }),
    );
    expect(erro).toEqual([]);

    const comEvidencia = signalsFor(
      makePlace({
        siteType: "site_proprio",
        auditStatus: "done",
        viewport: false,
        hasBooking: false,
      }),
    );
    expect(comEvidencia).toContain("o site não apresentou adaptação para celular na auditoria");
    expect(comEvidencia).toContain("não foi detectado agendamento online no site auditado");
  });

  it("separa WhatsApp confirmado de celular e respeita opt-out", () => {
    const mobileOnly = contactCapabilities(makePlace());
    expect(mobileOnly.hasConfirmedWhatsapp).toBe(false);
    expect(mobileOnly.hasMobile).toBe(true);
    expect(mobileOnly.hasUsableContact).toBe(true);

    const confirmed = contactCapabilities(
      makePlace({ contacts: [{ kind: "whatsapp", value: "+5562999991111", source: "site_empresa", confirmed: true }] }),
    );
    expect(confirmed.hasConfirmedWhatsapp).toBe(true);

    const optedOut = contactCapabilities(makePlace({ optedOut: true }));
    expect(optedOut.hasUsableContact).toBe(false);
    expect(isPriorityLead(makePlace({ optedOut: true }))).toBe(false);
  });

  it("distingue 'Com contato' de 'Prioritário' e filtra 'Abordar agora'", () => {
    const lowScoreWithPhone = makePlace({ score: 40 });
    expect(contactCapabilities(lowScoreWithPhone).hasUsableContact).toBe(true);
    expect(isPriorityLead(lowScoreWithPhone)).toBe(false);

    const alreadyContacted = makePlace({ score: 85, leadId: "d1", leadStage: "primeiro_contato" });
    expect(isNextApproachable(alreadyContacted)).toBe(false);

    const noContact = makePlace({ score: 85, contacts: [], googlePhone: null });
    expect(isNextApproachable(noContact)).toBe(false);

    const ready = makePlace({ score: 85, leadStage: "novo" });
    expect(isNextApproachable(ready)).toBe(true);
  });

  it("calcula backoff exponencial e pausa polling após falhas seguidas", () => {
    expect(nextPollDelayMs(0)).toBe(3000);
    expect(nextPollDelayMs(1)).toBe(5000);
    expect(nextPollDelayMs(2)).toBe(8000);
    expect(nextPollDelayMs(5)).toBe(20000);
    expect(nextPollDelayMs(6)).toBeNull();
  });

  it("valida e converte a oferta 'Você vende' para o serviço do CRM", () => {
    expect(resolveOfferService("site")).toBe("Site institucional");
    expect(resolveOfferService("agendamento")).toBe("Site + agendamento");
    expect(resolveOfferService("landing")).toBe("Landing page");
    expect(resolveOfferService("automacao_whatsapp")).toBe("Automação de WhatsApp");
    expect(resolveOfferService("Site institucional")).toBe("Site institucional");
    expect(resolveOfferService("inventado")).toBeNull();
    expect(resolveOfferService(null)).toBeNull();
  });
});
