import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/server", () => ({ auth: { getSession: async () => ({ data: null }) } }));

const dialect = new PgDialect();
const nextResults: unknown[][] = [];

vi.mock("@/lib/db", () => ({
  db: {
    execute: async (q: SQL) => {
      dialect.sqlToQuery(q);
      return { rows: nextResults.shift() ?? [] };
    },
  },
  pool: {},
}));

import { DEFAULT_TEMPLATES, pickTemplateForOffer } from "@/lib/messages";
import { buildProspectQueue, deriveApproachStatus, isHiddenFromQueue } from "@/lib/prospecting";
import type { RadarPlace } from "@/lib/types";

function makePlace(patch: Partial<RadarPlace> = {}): RadarPlace {
  return {
    id: "p1",
    source: "overture",
    overtureId: "ov-1",
    googlePlaceId: null,
    confidence: 0.9,
    sourceCount: 2,
    name: "Negócio Teste",
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

describe("P3 — Fila inteligente, status de abordagem e modelos por oferta", () => {
  const NOW = Date.parse("2026-11-18T12:00:00.000Z");

  it("deriva corretamente todos os status de relacionamento", () => {
    expect(deriveApproachStatus(makePlace(), NOW)).toBe("nao_abordado");
    expect(deriveApproachStatus(makePlace({ hasDraft: true }), NOW)).toBe("mensagem_preparada");
    expect(deriveApproachStatus(makePlace({ leadStage: "primeiro_contato" }), NOW)).toBe("contatado");
    expect(deriveApproachStatus(makePlace({ leadStage: "conversa" }), NOW)).toBe("respondeu");
    expect(deriveApproachStatus(makePlace({ leadStage: "proposta" }), NOW)).toBe("em_negociacao");
    expect(deriveApproachStatus(makePlace({ leadStage: "ganho" }), NOW)).toBe("ganho");
    expect(deriveApproachStatus(makePlace({ leadStage: "perdido" }), NOW)).toBe("perdido");
    expect(deriveApproachStatus(makePlace({ snoozedUntil: "2026-11-25T12:00:00.000Z" }), NOW)).toBe("adiado");
    expect(deriveApproachStatus(makePlace({ snoozedUntil: "2026-11-10T12:00:00.000Z" }), NOW)).toBe("nao_abordado");
    expect(deriveApproachStatus(makePlace({ ignored: true }), NOW)).toBe("ignorado");
  });

  it("prioriza leads com contato confirmado e exclui ignorados/adiados/contatados", () => {
    const ignored = makePlace({ id: "ign", ignored: true, score: 99 });
    const snoozed = makePlace({ id: "snz", snoozedUntil: "2026-11-25T12:00:00.000Z", score: 99 });
    const contacted = makePlace({ id: "cnt", leadStage: "primeiro_contato", score: 95 });
    const noContact = makePlace({ id: "noc", contacts: [], score: 95 });
    const mobile = makePlace({ id: "mob", score: 76 });
    const waConfirmed = makePlace({
      id: "wac",
      score: 76,
      contacts: [{ kind: "whatsapp", value: "+5562999992222", source: "site_empresa", confirmed: true }],
    });

    expect(isHiddenFromQueue(snoozed, NOW)).toBe(true);
    const queue = buildProspectQueue([ignored, snoozed, contacted, noContact, mobile, waConfirmed], { offer: "site", nowMs: NOW });
    expect(queue.map((q) => q.place.id)).toEqual(["wac", "mob"]);
    expect(queue[0].reasons).toContain("WhatsApp confirmado");
  });

  it("seleciona o modelo comercial correspondente à oferta", () => {
    const templates = DEFAULT_TEMPLATES.map((t, i) => ({ id: String(i), ...t, service: t.service ?? null }));
    expect(pickTemplateForOffer(templates, "primeiro_contato", "Site + agendamento")?.name).toBe("Primeiro contato — Site + agendamento");
    expect(pickTemplateForOffer(templates, "primeiro_contato", "Automação de WhatsApp")?.name).toBe("Primeiro contato — Automação de WhatsApp");
    expect(pickTemplateForOffer(templates, "primeiro_contato", "Outro serviço")?.name).toBe("Primeiro contato — direto");
  });

  it("bloqueia ações de prospecção para papéis sem módulo comercial ou somente leitura", async () => {
    const { setPlaceProspectState } = await import("@/lib/services/prospecting");
    await expect(
      setPlaceProspectState(
        { workspaceId: "w1", userId: "u1", email: null, role: "producao", actor: "user", scope: "write" },
        "00000000-0000-0000-0000-000000000001",
        { action: "ignorar" },
      ),
    ).rejects.toThrow(/permissão/i);
    await expect(
      setPlaceProspectState(
        { workspaceId: "w1", userId: "u1", email: null, role: "owner", actor: "mcp", scope: "read" },
        "00000000-0000-0000-0000-000000000001",
        { action: "adiar", days: 7 },
      ),
    ).rejects.toThrow(/somente leitura/i);
  });

  it("calcula cobertura de contatos e taxa de resposta/propostas no relatório SQL", async () => {
    nextResults.push(
      [{ source: "radar", n: 4, won: 1, value: "100000" }],
      [{ label: "Novo", kind: "open", n: 3, value: "70000" }, { label: "Fechado ganho", kind: "won", n: 1, value: "30000" }],
      [],
      [{ n: 1, avg_ticket: "30000", avg_days: "5.0" }],
      [],
      [{ total: 10, with_contact: 8 }],
      [{ contacted_deals: 8, sent_messages: 12, replied_deals: 3, proposals_sent: 4, proposals_approved: 2 }],
    );
    const { reportsData } = await import("@/lib/services/reports");
    const r = await reportsData(
      { workspaceId: "00000000-0000-0000-0000-000000000001", userId: "u1", email: null, role: "owner", actor: "user", scope: "write" },
      90,
    );
    expect(r.contactCoverage).toEqual({ total: 10, withContact: 8, rate: 0.8 });
    expect(r.outreach).toEqual({
      contactedDeals: 8,
      sentMessages: 12,
      repliedDeals: 3,
      replyRate: 3 / 8,
      proposalsSent: 4,
      proposalsApproved: 2,
      proposalApprovalRate: 0.5,
    });
  });
});
