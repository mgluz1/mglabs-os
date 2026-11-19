import { existsSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@vercel/functions", () => ({ attachDatabasePool: () => {} }));
vi.mock("next/server", () => ({ connection: async () => {} }));

let mockSession: { user: { id: string; email: string } } | null = null;
vi.mock("@/lib/auth/server", () => ({
  auth: {
    getSession: async () => ({ data: mockSession }),
  },
}));

let mockTokenCtx: Ctx | null = null;
vi.mock("@/lib/services/tokens", () => ({
  ctxFromToken: async () => mockTokenCtx,
}));

const mockCompany360 = vi.fn();
const mockContactBlock = vi.fn();
const mockSaveDraft = vi.fn();
const mockRequireCtx = vi.fn();

vi.mock("@/lib/services/companies", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/companies")>();
  return { ...actual, getCompany360: (...args: unknown[]) => mockCompany360(...args) };
});

vi.mock("@/lib/services/optout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/optout")>();
  return { ...actual, contactBlock: (...args: unknown[]) => mockContactBlock(...args) };
});

vi.mock("@/lib/services/messages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/messages")>();
  return { ...actual, saveDraft: (...args: unknown[]) => mockSaveDraft(...args) };
});

vi.mock("@/lib/services/ctx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/ctx")>();
  return { ...actual, requireCtx: () => mockRequireCtx(), audit: async () => {} };
});

vi.mock("@/lib/db", () => ({
  db: {
    execute: async () => ({ rows: [] }),
    transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn({ execute: async () => ({ rows: [] }) }),
  },
  pool: {},
}));

import { GET as healthGet } from "@/app/api/health/route";
import { DELETE as mcpDelete, GET as mcpGet, POST as mcpPost } from "@/app/api/mcp/route";
import { PRIMARY_NAV, SETTINGS_ITEM } from "@/components/shell/nav";
import { generateMessagesAction } from "@/lib/actions/ai";
import { aiConfig } from "@/lib/ai/gemini";
import { buildProspectQueue } from "@/lib/prospecting";
import { buildPlacesGeoJson, PLACE_RING_COLOR } from "@/lib/radar-geojson";
import type { Ctx } from "@/lib/services/ctx";
import type { RadarPlace } from "@/lib/types";

function makeCtx(scope: "read" | "write" = "read"): Ctx {
  return {
    workspaceId: "00000000-0000-0000-0000-000000000001",
    userId: "user-1",
    email: "owner@mglabs.com.br",
    role: "owner",
    actor: "mcp",
    scope,
  };
}

function makePlace(i: number, overrides: Partial<RadarPlace> = {}): RadarPlace {
  const score = i % 4 === 0 ? null : i % 4 === 1 ? 30 : i % 4 === 2 ? 55 : 82;
  return {
    id: `place-${i}`,
    source: "overture",
    overtureId: `ov-${i}`,
    googlePlaceId: null,
    confidence: 0.9,
    sourceCount: 2,
    name: `Empresa ${i}`,
    category: "dentista",
    address: `Rua ${i}, 100`,
    neighborhood: "Centro",
    city: "São Paulo",
    lat: -23.55 + (i % 100) * 0.001,
    lng: -46.63 + Math.floor(i / 100) * 0.001,
    rating: null,
    ratingCount: null,
    googlePhone: i % 5 === 0 ? null : `+551199${String(i).padStart(7, "0")}`,
    googleWebsite: i % 3 === 0 ? null : `https://empresa${i}.com.br`,
    googleMapsUri: null,
    auditStatus: i % 4 === 0 ? "pending" : "done",
    auditError: null,
    auditedAt: "2026-11-18T12:00:00.000Z",
    scoredAt: "2026-11-18T12:00:00.000Z",
    siteType: i % 3 === 0 ? "sem_site" : "site_proprio",
    https: null,
    viewport: false,
    psiPerformance: 45,
    hasBooking: false,
    hasServicesPage: null,
    approachable: i % 5 !== 0,
    oldSite: [],
    score,
    rules: [],
    contacts: i % 5 === 0 ? [] : [{ kind: "whatsapp", value: `+551199${String(i).padStart(7, "0")}`, source: "overture", confirmed: false }],
    leadId: null,
    leadStage: i % 11 === 0 ? "primeiro_contato" : null,
    companyId: i % 11 === 0 ? `comp-${i}` : null,
    optedOut: i % 19 === 0,
    ignored: i % 23 === 0,
    snoozedUntil: i % 29 === 0 ? "2099-12-31T00:00:00.000Z" : null,
    hasDraft: i % 17 === 0,
    ...overrides,
  };
}

function mcpRequest(body: unknown, bearer?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("P4 — QA, performance e fluxos transversais", () => {
  beforeEach(() => {
    mockSession = null;
    mockTokenCtx = null;
    mockCompany360.mockReset();
    mockContactBlock.mockReset();
    mockSaveDraft.mockReset();
    mockRequireCtx.mockReset();
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_ENABLED;
  });

  it("benchmark: constrói GeoJSON WebGL e fila de prospecção para 5.000 leads em grande volume", () => {
    const places = Array.from({ length: 5000 }, (_, i) => makePlace(i));

    const t0 = performance.now();
    const geojson = buildPlacesGeoJson(places);
    const queue = buildProspectQueue(places, { limit: 20 });
    const elapsedMs = performance.now() - t0;

    expect(geojson.type).toBe("FeatureCollection");
    expect(geojson.features).toHaveLength(5000);
    expect(geojson.features[0]?.geometry).toEqual({
      type: "Point",
      coordinates: [places[0].lng, places[0].lat],
    });
    expect(geojson.features[0]?.properties.ringColor).toBe(PLACE_RING_COLOR.analisando);
    expect(geojson.features[1]?.properties.ringColor).toBe(PLACE_RING_COLOR.frio);
    expect(queue.length).toBeLessThanOrEqual(20);
    expect(queue.every((q) => !q.place.ignored && !q.place.optedOut && !q.place.leadStage)).toBe(true);
    expect(elapsedMs).toBeLessThan(500);
  });

  it("MCP /api/mcp: valida autenticação, métodos permitidos, catálogo de ferramentas, escrita restrita e opt-out", async () => {
    const getRes = await mcpGet();
    expect(getRes.status).toBe(405);
    expect(getRes.headers.get("allow")).toBe("POST");
    const delRes = await mcpDelete();
    expect(delRes.status).toBe(405);

    const unauthRes = await mcpPost(mcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
    expect(unauthRes.status).toBe(401);
    expect(unauthRes.headers.get("www-authenticate")).toContain("mglabs-os");

    mockTokenCtx = makeCtx("read");

    const listRes = await mcpPost(mcpRequest({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, "mglabs_ro_test"));
    expect(listRes.status).toBe(200);
    const listJson = (await listRes.json()) as { result: { tools: { name: string }[] } };
    const names = listJson.result.tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "append_activity",
      "create_message_draft",
      "create_task",
      "get_company",
      "get_lead",
      "get_pipeline",
      "get_project_briefing",
      "list_companies",
      "list_due_tasks",
      "list_leads",
      "list_projects",
      "search",
      "update_deal_stage",
    ]);

    const writeAttempt = await mcpPost(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "create_message_draft",
            arguments: {
              company_id: "11111111-1111-4111-8111-111111111110",
              objective: "primeiro_contato",
              body: "Olá, gostaria de conversar sobre seu site.",
              channel: "whatsapp",
            },
          },
        },
        "mglabs_ro_test",
      ),
    );
    const writeJson = (await writeAttempt.json()) as { result: { isError?: boolean; content: { text: string }[] } };
    expect(writeJson.result.isError).toBe(true);
    expect(writeJson.result.content[0]?.text).toContain("somente leitura");
    expect(mockSaveDraft).not.toHaveBeenCalled();

    mockCompany360.mockResolvedValue({
      company: {
        id: "11111111-1111-4111-8111-111111111110",
        name: "Clínica Bloqueada",
        status: "lead",
        category: "dentista",
        city: "São Paulo",
        source: "radar",
      },
      contacts: [
        { id: "c1", name: "Ana", role: "Sócia", optedOut: false, whatsapp: "+5511999999999", phone: "+5511999999999", email: "ana@clinica.com" },
      ],
      deals: [],
      tasks: [],
      proposals: [],
      projects: [],
      timeline: [],
    });
    mockContactBlock.mockResolvedValue({ blocked: true, reason: "Pediu para não ser contatado." });

    const companyRes = await mcpPost(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: { name: "get_company", arguments: { id: "11111111-1111-4111-8111-111111111110" } },
        },
        "mglabs_ro_test",
      ),
    );
    const companyJson = (await companyRes.json()) as { result: { content: { text: string }[] } };
    const parsed = JSON.parse(companyJson.result.content[0]?.text ?? "{}") as {
      naoContatar: boolean;
      contatos: { whatsapp?: string; telefone?: string; email?: string }[];
    };
    expect(parsed.naoContatar).toBe(true);
    expect(parsed.contatos[0]?.whatsapp).toBeUndefined();
    expect(parsed.contatos[0]?.telefone).toBeUndefined();
    expect(parsed.contatos[0]?.email).toBeUndefined();
  });

  it("Gemini opcional: desabilita com segurança sem GEMINI_API_KEY e retorna aviso claro em ações", async () => {
    expect(aiConfig().enabled).toBe(false);
    mockRequireCtx.mockResolvedValue({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      userId: "user-1",
      email: "owner@mglabs.com.br",
      role: "owner",
      actor: "user",
      scope: "write",
    } satisfies Ctx);

    const r = await generateMessagesAction({
      companyId: "11111111-1111-4111-8111-111111111110",
      objective: "primeiro_contato",
      tone: "direto",
      optOut: false,
      consent: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("GEMINI_API_KEY");
    }
  });

  it("smoke: rotas da navegação simplificada, loading/error/404 e health check existem e respondem corretamente", async () => {
    const root = process.cwd();
    const routes = [...PRIMARY_NAV, SETTINGS_ITEM].map((item) => item.href);
    for (const href of routes) {
      const slug = href.replace(/^\//, "");
      expect(existsSync(path.join(root, "app/(app)", slug, "page.tsx"))).toBe(true);
    }
    expect(existsSync(path.join(root, "app/(app)/loading.tsx"))).toBe(true);
    expect(existsSync(path.join(root, "app/(app)/error.tsx"))).toBe(true);
    expect(existsSync(path.join(root, "app/(app)/not-found.tsx"))).toBe(true);

    const res = await healthGet();
    expect(res.status).toBe(401);
  });
});
