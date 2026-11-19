import { gzipSync } from "node:zlib";

import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/server", () => ({ auth: { getSession: async () => ({ data: null }) } }));
vi.mock("@vercel/functions", () => ({ attachDatabasePool: () => {} }));

const dialect = new PgDialect();
const executedSql: string[] = [];
let mockExecute: (sqlText: string, params: unknown[]) => Promise<{ rows: unknown[] }> = async () => ({ rows: [] });

vi.mock("@/lib/db", () => {
  const txObj = {
    execute: (q: SQL) => {
      const { sql, params } = dialect.sqlToQuery(q);
      executedSql.push(sql);
      return mockExecute(sql, params);
    },
    select: () => {
      throw new Error("unexpected select in unit mock");
    },
    insert: () => {
      throw new Error("unexpected insert in unit mock");
    },
    update: () => {
      throw new Error("unexpected update in unit mock");
    },
    delete: () => {
      throw new Error("unexpected delete in unit mock");
    },
  };
  return {
    db: {
      ...txObj,
      transaction: async <T>(fn: (tx: typeof txObj) => Promise<T>) => fn(txObj),
    },
    pool: {},
  };
});

import type { RoleId } from "@/lib/config/crm";
import type { Ctx } from "@/lib/services/ctx";

function makeCtx(role: RoleId, scope: "read" | "write" = "write"): Ctx {
  return {
    workspaceId: "00000000-0000-0000-0000-000000000001",
    userId: `u-${role}`,
    email: `${role}@mglabs.com.br`,
    role,
    actor: scope === "read" ? "mcp" : "user",
    scope,
  };
}

function ovLine(i: number, release = "2026-10-01.0", id?: string) {
  return JSON.stringify({
    id: id ?? `ov-${i}`,
    name: `Lugar ${i}`,
    basic_category: "restaurant",
    taxonomy_primary: "restaurant",
    hierarchy: ["eat_and_drink"],
    alternates: [],
    brand: null,
    confidence: 0.9,
    operating_status: "open",
    websites: [],
    socials: [],
    emails: [],
    phones: [],
    address: "Rua 1",
    locality: "Goiânia",
    postcode: "74000-000",
    source_count: 2,
    lng: -49.27,
    lat: -16.68,
    release,
  });
}

describe("P0.1 — Overture: validação, staging atômico e permissão admin", () => {
  beforeEach(() => {
    executedSql.length = 0;
    mockExecute = async () => ({ rows: [] });
  });

  it("rejeita carga com menos de 100 registros, JSON corrompido ou sem release", async () => {
    const { parseOvertureJsonl } = await import("@/lib/overture/import");

    const few = Array.from({ length: 99 }, (_, i) => ovLine(i)).join("\n");
    expect(parseOvertureJsonl(few).ok).toBe(false);

    const corrupt = [ovLine(1), "{json-quebrado"].join("\n");
    const rCorrupt = parseOvertureJsonl(corrupt, 1);
    expect(rCorrupt.ok).toBe(false);
    if (!rCorrupt.ok) expect(rCorrupt.error).toMatch(/corrompido|truncado/i);

    const noRelease = ovLine(1, "");
    expect(parseOvertureJsonl(noRelease, 1).ok).toBe(false);

    // Deduplica IDs repetidos antes de contar mínimo
    const duplicated = Array.from({ length: 120 }, (_, i) => ovLine(i, "2026-10-01.0", "mesmo-id")).join("\n");
    expect(parseOvertureJsonl(duplicated).ok).toBe(false);
  });

  it("rejeita carga incompleta pela cobertura (< 50% da base atual) sem remover registros", async () => {
    const { importOverture } = await import("@/lib/overture/import");
    const payload = gzipSync(Array.from({ length: 120 }, (_, i) => ovLine(i)).join("\n"));
    mockExecute = async (sqlText) => {
      if (sqlText.includes("select count(*)::int as n from ov_places")) return { rows: [{ n: 1000 }] };
      return { rows: [] };
    };
    const res = await importOverture("https://example.com/ov.jsonl.gz", {
      fetchImpl: async () => new Response(payload, { status: 200 }),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/incompleta/i);
    expect(executedSql.some((s) => s.includes("delete from ov_places"))).toBe(false);
    expect(executedSql.some((s) => s.includes("insert into ov_places "))).toBe(false);
  });

  it("usa tabela temporária de staging e substitui/remove somente após validar", async () => {
    const { importOverture } = await import("@/lib/overture/import");
    const payload = gzipSync(Array.from({ length: 120 }, (_, i) => ovLine(i)).join("\n"));
    mockExecute = async (sqlText) => {
      if (sqlText.includes("delete from ov_places")) return { rows: [{ n: 80 }] };
      if (sqlText.includes("from ov_places_stage") && sqlText.includes("count(*)")) return { rows: [{ n: 120 }] };
      if (sqlText.includes("from ov_places") && sqlText.includes("count(*)")) return { rows: [{ n: 200 }] };
      return { rows: [] };
    };
    const res = await importOverture("https://example.com/ov.jsonl.gz", {
      fetchImpl: async () => new Response(payload, { status: 200 }),
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.rows).toBe(120);
      expect(res.removed).toBe(80);
    }
    const stageIdx = executedSql.findIndex((s) => s.includes("create temp table ov_places_stage"));
    const upsertIdx = executedSql.findIndex((s) => s.includes("insert into ov_places ("));
    const delIdx = executedSql.findIndex((s) => s.includes("delete from ov_places"));
    expect(stageIdx).toBeGreaterThan(-1);
    expect(upsertIdx).toBeGreaterThan(stageIdx);
    expect(delIdx).toBeGreaterThan(upsertIdx);
  });

  it("rejeita atualização manual do Overture para papéis não administrativos", async () => {
    const { importOvertureAsAdmin } = await import("@/lib/overture/import");
    for (const role of ["comercial", "producao", "financeiro"] as RoleId[]) {
      await expect(importOvertureAsAdmin(makeCtx(role))).rejects.toThrow(/administradores|permissão/i);
    }
    await expect(importOvertureAsAdmin(makeCtx("owner", "read"))).rejects.toThrow(/somente leitura/i);
  });
});

describe("P0.2 — SSRF: validação de IPs, DNS, redirecionamentos e pinning", () => {
  it("bloqueia URLs e IPs privados, link-local, CGNAT, IPv6 local/mapped e portas não-web", async () => {
    const { isPublicIp, isPublicWebUrl } = await import("@/lib/audit/fetch-site");

    for (const badIp of [
      "127.0.0.1",
      "10.0.0.1",
      "172.16.5.4",
      "192.168.1.10",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "198.18.0.1",
      "224.0.0.1",
      "::1",
      "::",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "::ffff:169.254.169.254",
      "::ffff:10.0.0.1",
    ]) {
      expect(isPublicIp(badIp), `esperava bloqueio de ${badIp}`).toBe(false);
    }

    expect(isPublicIp("8.8.8.8")).toBe(true);
    expect(isPublicIp("1.1.1.1")).toBe(true);
    expect(isPublicIp("2606:4700:4700::1111")).toBe(true);

    for (const badUrl of [
      "http://localhost/admin",
      "http://127.0.0.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://metadata/",
      "http://redis:6379/",
      "https://empresa.com.br:5432/",
      "https://user:pass@empresa.com.br/",
      "file:///etc/passwd",
      "http://servico.internal/health",
    ]) {
      expect(isPublicWebUrl(badUrl), `esperava bloqueio de ${badUrl}`).toBe(false);
    }

    expect(isPublicWebUrl("https://mglabs.com.br")).toBe(true);
    expect(isPublicWebUrl("http://1.1.1.1/teste")).toBe(true);
  });

  it("bloqueia DNS que resolve para IP privado ou misto (DNS rebinding/interno)", async () => {
    const { fetchHomepage, resolvePublicAddresses } = await import("@/lib/audit/fetch-site");

    await expect(
      resolvePublicAddresses("https://evil.example.com", async () => [{ address: "127.0.0.1", family: 4 }]),
    ).rejects.toThrow(/endereço não permitido/);

    await expect(
      resolvePublicAddresses("https://evil.example.com", async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "169.254.169.254", family: 4 },
      ]),
    ).rejects.toThrow(/endereço não permitido/);

    await expect(
      resolvePublicAddresses("https://evil6.example.com", async () => [{ address: "::ffff:127.0.0.1", family: 6 }]),
    ).rejects.toThrow(/endereço não permitido/);

    const r = await fetchHomepage("https://evil.example.com", {
      lookup: async () => [{ address: "10.0.0.5", family: 4 }],
    });
    expect(r).toEqual({ ok: false, reason: "endereço não permitido" });
  });

  it("bloqueia redirecionamento para destino interno e fixa IP resolvido no request", async () => {
    const { fetchHomepage } = await import("@/lib/audit/fetch-site");
    let lookupCount = 0;
    const pinnedSeen: string[] = [];

    const blockedRedirect = await fetchHomepage("https://publica.com.br", {
      lookup: async (host) => {
        lookupCount++;
        if (host === "publica.com.br") return [{ address: "93.184.216.34", family: 4 }];
        return [{ address: "169.254.169.254", family: 4 }];
      },
      request: async (targetUrl, pinned) => {
        pinnedSeen.push(`${targetUrl}->${pinned[0].address}`);
        if (targetUrl.endsWith("/robots.txt")) return { status: 404, headers: {}, body: "" };
        return {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data/" },
          body: "",
        };
      },
    });
    expect(blockedRedirect).toEqual({ ok: false, reason: "endereço não permitido" });
    expect(lookupCount).toBeGreaterThan(0);

    const okPage = await fetchHomepage("https://publica.com.br", {
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
      request: async (targetUrl, pinned) => {
        expect(pinned[0].address).toBe("93.184.216.34");
        if (targetUrl.endsWith("/robots.txt")) return { status: 200, headers: {}, body: "User-agent: *\nAllow: /" };
        return { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: "<html><h1>Oi</h1></html>" };
      },
    });
    expect(okPage).toEqual({ ok: true, html: "<html><h1>Oi</h1></html>", finalUrl: "https://publica.com.br" });
  });
});

describe("P0.3 — Matriz de autorização por papel e escopo", () => {
  it("bloqueia operações comerciais para papel produção", async () => {
    const prod = makeCtx("producao");
    const deals = await import("@/lib/services/deals");
    const companies = await import("@/lib/services/companies");
    const messages = await import("@/lib/services/messages");
    const proposals = await import("@/lib/services/proposals");
    const optout = await import("@/lib/services/optout");
    const reports = await import("@/lib/services/reports");
    const ai = await import("@/lib/ai/features");

    await expect(deals.listDeals(prod)).rejects.toThrow(/permissão/i);
    await expect(deals.createDeal(prod, { companyId: "00000000-0000-0000-0000-000000000002", title: "X" })).rejects.toThrow(/permissão/i);
    await expect(companies.createCompany(prod, { name: "X" })).rejects.toThrow(/permissão/i);
    await expect(messages.saveDraft(prod, { objective: "primeiro_contato", body: "Oi" })).rejects.toThrow(/permissão/i);
    await expect(messages.registerSent(prod, { draft: { objective: "primeiro_contato", body: "Oi" }, channel: "whatsapp" })).rejects.toThrow(/permissão/i);
    await expect(proposals.createProposal(prod, { companyId: "00000000-0000-0000-0000-000000000002", title: "P" })).rejects.toThrow(/permissão/i);
    await expect(optout.registerOptOut(prod, { companyId: "00000000-0000-0000-0000-000000000002" })).rejects.toThrow(/permissão/i);
    await expect(reports.reportsData(prod)).rejects.toThrow(/permissão/i);
    await expect(ai.generateMessageVariants(prod, { objective: "primeiro_contato", tone: "natural", sender: "M", optOut: true, consent: true })).rejects.toThrow(/permissão/i);
  });

  it("bloqueia operações de produção para papel financeiro e operações financeiras/config para comercial", async () => {
    const fin = makeCtx("financeiro");
    const com = makeCtx("comercial");
    const projects = await import("@/lib/services/projects");
    const finance = await import("@/lib/services/finance");
    const tokens = await import("@/lib/services/tokens");
    const deals = await import("@/lib/services/deals");

    await expect(projects.createProject(fin, { companyId: "00000000-0000-0000-0000-000000000002", name: "Proj" })).rejects.toThrow(/permissão/i);
    await expect(projects.getProject(fin, "00000000-0000-0000-0000-000000000002")).rejects.toThrow(/permissão/i);
    await expect(projects.convertDealToProject(fin, "00000000-0000-0000-0000-000000000002")).rejects.toThrow(/permissão/i);

    await expect(finance.registerPayment(com, { receivableId: "00000000-0000-0000-0000-000000000002", amountCents: 100, paidAt: "2026-11-18" })).rejects.toThrow(/permissão/i);
    await expect(finance.financeSummary(com)).rejects.toThrow(/permissão/i);
    await expect(tokens.createApiToken(com, { name: "tok", scope: "read" })).rejects.toThrow(/permissão/i);
    await expect(deals.updateStage(com, "novo", { label: "X" })).rejects.toThrow(/permissão/i);
    await expect(deals.deleteDeal(com, "00000000-0000-0000-0000-000000000002")).rejects.toThrow(/administradores/i);
  });
});

describe("P0.6 — Reserva atômica de cota do Gemini", () => {
  beforeEach(() => {
    executedSql.length = 0;
  });

  it("usa advisory lock transacional e nega quando soma atinge o limite", async () => {
    const { reserveAiQuota } = await import("@/lib/ai/gemini");
    mockExecute = async (sqlText) => {
      if (sqlText.includes("coalesce(sum(calls), 0)")) return { rows: [{ n: 60 }] };
      return { rows: [] };
    };
    const denied = await reserveAiQuota(makeCtx("owner"), "mensagem", 60);
    expect(denied).toBe(false);
    expect(executedSql.some((s) => s.includes("pg_advisory_xact_lock"))).toBe(true);
    expect(executedSql.some((s) => s.includes("insert into ai_usage"))).toBe(false);

    executedSql.length = 0;
    mockExecute = async (sqlText) => {
      if (sqlText.includes("coalesce(sum(calls), 0)")) return { rows: [{ n: 59 }] };
      return { rows: [] };
    };
    const allowed = await reserveAiQuota(makeCtx("owner"), "mensagem", 60);
    expect(allowed).toBe(true);
    expect(executedSql.some((s) => s.includes("insert into ai_usage"))).toBe(true);
  });
});
