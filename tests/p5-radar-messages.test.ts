import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/server", () => ({ auth: { getSession: async () => ({ data: null }) } }));
vi.mock("@vercel/functions", () => ({ attachDatabasePool: () => {} }));

const { dialect, capturedSql, getNextRows, pushRows, resetRows, mockGenerateContent } = vi.hoisted(() => {
  const capturedSql: { sql: string; params: unknown[] }[] = [];
  let rowsQueue: unknown[][] = [];
  return {
    dialect: null as unknown,
    capturedSql,
    getNextRows: () => rowsQueue.shift() ?? [],
    pushRows: (...items: unknown[][]) => rowsQueue.push(...items),
    resetRows: () => {
      rowsQueue = [];
    },
    mockGenerateContent: vi.fn(),
  };
});
void dialect;
const pgDialect = new PgDialect();

vi.mock("@/lib/db", () => {
  const tx = {
    execute: async (q: SQL) => {
      capturedSql.push(pgDialect.sqlToQuery(q));
      return { rows: getNextRows() };
    },
    select: () => {
      const rows = getNextRows();
      const builder: Record<string, unknown> = {
        from: () => builder,
        leftJoin: () => builder,
        where: () => builder,
        orderBy: () => builder,
        limit: () => builder,
        for: () => builder,
        then: (resolve: (v: unknown) => void) => Promise.resolve(rows).then(resolve),
      };
      return builder;
    },
    insert: () => {
      const rows = getNextRows();
      const builder: Record<string, unknown> = {
        values: () => builder,
        onConflictDoNothing: () => builder,
        returning: async () => rows,
        then: (resolve: (v: unknown) => void) => Promise.resolve(rows).then(resolve),
      };
      return builder;
    },
    update: () => {
      const rows = getNextRows();
      const builder: Record<string, unknown> = {
        set: () => builder,
        where: () => builder,
        returning: async () => rows,
        then: (resolve: (v: unknown) => void) => Promise.resolve(rows).then(resolve),
      };
      return builder;
    },
  };
  return {
    db: {
      ...tx,
      transaction: async <T>(fn: (txArg: typeof tx) => Promise<T>) => fn(tx),
    },
    pool: {},
  };
});

let mockPlace: Record<string, unknown> | null = null;
vi.mock("@/lib/queries", () => ({
  placeById: async () => mockPlace,
}));

vi.mock("@google/genai", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(opts: { message: string; status: number }) {
      super(opts.message);
      this.status = opts.status;
    }
  },
  GoogleGenAI: class GoogleGenAI {
    models = {
      generateContent: mockGenerateContent,
      get: async () => ({ name: "models/gemini-3.5-flash-lite" }),
    };
  },
}));

import { OFFER_CARDS } from "@/components/radar/ui";
import { generateMessageVariants } from "@/lib/ai/features";
import { riskWarnings } from "@/lib/ai/sanitize";
import { CATEGORIES, categoryLabel, searchCategories } from "@/lib/config/categories";
import { DEFAULT_TEMPLATES, pickTemplateForOffer } from "@/lib/messages";
import { countAvailablePlaces, runSearch } from "@/lib/places/search";
import type { Ctx } from "@/lib/services/ctx";
import { recordClientReply, registerSent, scheduleMessageFollowUp, toggleTemplateFavorite } from "@/lib/services/messages";

const OWNER_CTX: Ctx = {
  workspaceId: "11111111-1111-4111-8111-111111111111",
  userId: "user-1",
  email: "owner@mglabs.com.br",
  role: "owner",
  actor: "user",
  scope: "write",
};

describe("Radar + Mensagens + Gemini (melhorias)", () => {
  beforeEach(() => {
    capturedSql.length = 0;
    resetRows();
    mockPlace = null;
    mockGenerateContent.mockReset();
    delete process.env.GEMINI_API_KEY;
  });

  it("Radar: exibe exatamente duas opções em 'Você vende' e amplia categorias com busca inteligente", () => {
    expect(OFFER_CARDS.map((c) => ({ id: c.id, label: c.label }))).toEqual([
      { id: "site", label: "Site profissional" },
      { id: "servicos_mglabs", label: "Serviços MGLABS" },
    ]);

    expect(CATEGORIES.length).toBeGreaterThanOrEqual(14);
    expect(searchCategories("odontologia").some((c) => c.id === "dentista")).toBe(true);
    expect(searchCategories("pilates").some((c) => c.id === "academia")).toBe(true);
    expect(searchCategories("veterinaria").some((c) => c.id === "petshop")).toBe(true);
    expect(searchCategories("mecanica").some((c) => c.id === "oficina")).toBe(true);
    expect(categoryLabel("q:ótica")).toBe("ótica");
  });

  it("Radar: respeita limite dinâmico (5..600), detecta parcial via limit+1 e aceita segmento livre", async () => {
    // runSearch com limit=5 recebendo 6 linhas -> partial=true e salva no máximo 5
    const sixRows = Array.from({ length: 6 }, (_, i) => ({
      id: `ov-${i}`,
      name: `Ótica Central ${i}`,
      brand: null,
      confidence: "0.9",
      websites: [],
      socials: [],
      emails: [],
      phones: [`+556299999000${i}`],
      address: `Rua ${i}`,
      locality: "Goiânia",
      source_count: 2,
      lat: -16.68 + i * 0.005,
      lng: -49.26 + i * 0.005,
    }));
    pushRows(
      sixRows,
      [{ id: "22222222-2222-4222-8222-222222222222" }],
      sixRows.slice(0, 5).map((r, i) => ({ id: `33333333-3333-4333-8333-33333333330${i}`, overture_id: r.id })),
      [],
      [],
      [],
    );

    const res = await runSearch({
      category: "personalizado",
      query: "ótica",
      center: { lat: -16.6869, lng: -49.2648 },
      radiusM: 3000,
      limit: 2, // menor que 5 -> servidor força mínimo 5 (limit + 1 = 6 na query)
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.kept).toBe(5);
      expect(res.partial).toBe(true);
    }
    expect(capturedSql[0]?.params).toContain(6); // limit + 1
    expect(capturedSql[0]?.params).toContain("%ótica%");

    // countAvailablePlaces devolve disponibilidade real limitada a 600
    resetRows();
    pushRows([{ total: 42 }]);
    const avail = await countAvailablePlaces({
      category: "dentista",
      center: { lat: -16.6869, lng: -49.2648 },
      radiusM: 3000,
    });
    expect(avail).toEqual({ available: 42, maxLimit: 42, cappedAt: 600 });
  });

  it("Mensagens: modelos padrão cobrem Site profissional e Serviços MGLABS + alertas anti-clichê", () => {
    const tpls = DEFAULT_TEMPLATES.map((t, i) => ({ id: String(i), ...t, service: t.service ?? null }));
    expect(pickTemplateForOffer(tpls, "primeiro_contato", "Site profissional")?.name).toBe("Primeiro contato — Site profissional");
    expect(pickTemplateForOffer(tpls, "primeiro_contato", "Serviços MGLABS")?.name).toBe("Primeiro contato — Serviços MGLABS");

    expect(riskWarnings("Espero que esteja tudo bem! Queremos alavancar seus resultados com soluções inovadoras.")).toEqual([
      "jargão comercial robótico",
      "abertura formal/genérica",
    ]);
  });

  it("Gemini: gera 3 versões humanizadas com contexto, tamanho e fallback automático em 404", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";

    const CID = "44444444-4444-4444-8444-444444444444";
    const DID = "55555555-5555-4555-8555-555555555555";
    mockPlace = {
      id: "66666666-6666-4666-8666-666666666666",
      source: "overture",
      category: "dentista",
      auditStatus: "done",
      siteType: "sem_site",
      googleWebsite: null,
      psiPerformance: null,
      hasBooking: null,
      viewport: null,
      oldSite: [],
      contacts: [],
    };

    // select deal+stage, select company, select contacts, select activities (history), select optouts? -> order in messageContext:
    // 1. select deal (with join), 2. select company, 3. select contacts, 4. select activities, 5. contactBlock -> select company, select contacts, execute optouts
    // + reserveAiQuota: execute lock, execute sum, execute insert
    pushRows(
      [{ deal: { id: DID, companyId: CID, title: "Site Clínica Alfa", serviceType: "Site profissional", primaryContactId: null, nextStep: "Mandar retorno", nextStepAt: null }, stageKey: "primeiro_contato", stageLabel: "Primeiro contato" }],
      [{ id: CID, workspaceId: OWNER_CTX.workspaceId, name: "Clínica Alfa", category: "dentista", city: "Goiânia", source: "radar", placeId: "p1", phone: "+5562999991111", email: null, instagram: null, website: null }],
      [{ id: "c1", name: "Dra. Paula", whatsapp: "+5562999991111", phone: null, email: null, instagram: null }],
      [{ id: "a1", kind: "mensagem_enviada", channel: "whatsapp", content: "Oi Dra. Paula, mandei uma ideia de site.", occurredAt: new Date() }],
      [{ id: CID, placeId: null, phone: "+5562999991111" }],
      [],
      [],
      // reserveAiQuota:
      [],
      [{ n: 2 }],
      [],
    );

    const { ApiError } = await import("@google/genai");
    mockGenerateContent
      .mockRejectedValueOnce(new ApiError({ message: "model not found", status: 404 }))
      .mockResolvedValueOnce({
        text: JSON.stringify({
          variants: [
            { text: "Oi{{contato}}, {{remetente}} aqui de novo. Conseguiu ver a ideia do site para a Clínica Alfa?" },
            { text: "Olá{{contato}}! Passei para retomar nossa conversa sobre o site da Clínica Alfa." },
            { text: "Oi{{contato}}, tudo certo? Se fizer sentido esta semana, te mostro o rascunho da Clínica Alfa." },
          ],
        }),
      });

    const out = await generateMessageVariants(OWNER_CTX, {
      dealId: DID,
      objective: "follow_up",
      service: "Site profissional",
      tone: "natural",
      length: "curta",
      sender: "Miguel",
      optOut: true,
      consent: true,
    });

    expect(out).toHaveLength(3);
    expect(out[0]?.text).toContain("Miguel");
    expect(out[0]?.text).toContain("Clínica Alfa");
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    const secondCall = mockGenerateContent.mock.calls[1]?.[0] as { model: string; contents: string };
    expect(secondCall.model).toBe("gemini-3.1-flash-lite");
    expect(secondCall.contents).toContain("Tamanho desejado: curta");
    expect(secondCall.contents).toContain("Histórico recente com este lead");
  });

  it("Mensagens: registra envio com prazo flexível, resposta do cliente, follow-up e favorito", async () => {
    const CID = "77777777-7777-4777-8777-777777777777";
    const DID = "88888888-8888-4888-8888-888888888888";
    const TID = "99999999-9999-4999-8999-999999999999";

    // 1. registerSent (with followUpDays=5)
    resetRows();
    pushRows(
      [{ id: CID, placeId: null, phone: "+5562999991111" }], // contactBlock company
      [], // contactBlock contacts
      [], // contactBlock optouts
      [{ id: "draft-1", dealId: DID, companyId: CID, contactId: null, objective: "follow_up", body: "Oi, conseguiu ver?", origin: "manual", templateId: null, facts: null }], // insert draft returning
      [], // insert activity
      [], // update deal nextStep
      [{ id: "task-1", title: "Follow-up da mensagem enviada" }], // insert task
      [], // insert activity task
      [], // audit
    );
    const sent = await registerSent(OWNER_CTX, {
      draft: { companyId: CID, dealId: DID, objective: "follow_up", body: "Oi, conseguiu ver?", channel: "whatsapp", origin: "manual" },
      channel: "whatsapp",
      followUpDays: 5,
    });
    expect(sent).toBeDefined();

    // 2. recordClientReply
    resetRows();
    pushRows(
      [{ id: CID, name: "Clínica Alfa" }], // check company
      [], // insert activity
      [], // update deal
      [], // insert task
      // advanceDeal -> select deal+stage, stages, return
      [],
      [], // audit
    );
    const rep = await recordClientReply(OWNER_CTX, {
      companyId: CID,
      dealId: DID,
      channel: "whatsapp",
      summary: "Pediu orçamento para semana que vem.",
      advanceToConversation: true,
      followUpDays: 2,
    });
    expect(rep.ok).toBe(true);

    // 3. scheduleMessageFollowUp
    resetRows();
    pushRows(
      [{ id: CID, name: "Clínica Alfa" }],
      [{ id: "task-2", title: "Mandar proposta revisada" }],
      [],
      [],
      [],
    );
    const task = await scheduleMessageFollowUp(OWNER_CTX, {
      companyId: CID,
      dealId: DID,
      title: "Mandar proposta revisada",
      days: 4,
      priority: "alta",
    });
    expect(task.title).toBe("Mandar proposta revisada");

    // 4. toggleTemplateFavorite
    resetRows();
    pushRows([{ id: TID, name: "Modelo 1", favorite: true }]);
    const fav = await toggleTemplateFavorite(OWNER_CTX, TID, true);
    expect(fav.favorite).toBe(true);
  });
});
