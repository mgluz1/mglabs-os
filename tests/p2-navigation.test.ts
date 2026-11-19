import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/server", () => ({ auth: { getSession: async () => ({ data: null }) } }));

const dialect = new PgDialect();
let lastSql = "";

vi.mock("@/lib/db", () => ({
  db: {
    execute: async (q: SQL) => {
      lastSql = dialect.sqlToQuery(q).sql;
      return {
        rows: [
          { kind: "empresa", id: "c1", title: "Studio Aurora", subtitle: "Goiânia" },
          { kind: "contato", id: "k1", title: "Ana", subtitle: "Studio Aurora" },
        ],
      };
    },
  },
  pool: {},
}));

import { COMMAND_LINKS, PRIMARY_NAV, QUICK_CREATE, SETTINGS_ITEM } from "@/components/shell/nav";

describe("P2 — Navegação enxuta, atalhos e busca global", () => {
  it("mantém apenas 6 entradas principais na sidebar e Configurações separado", () => {
    expect(PRIMARY_NAV.map((i) => i.label)).toEqual(["Início", "Radar", "CRM", "Mensagens", "Agenda", "Projetos"]);
    expect(PRIMARY_NAV.map((i) => i.href)).toEqual(["/dashboard", "/radar", "/crm", "/mensagens", "/tarefas", "/projetos"]);
    expect(SETTINGS_ITEM.href).toBe("/configuracoes");

    const allHrefs = [...PRIMARY_NAV.map((i) => i.href), ...COMMAND_LINKS.map((i) => i.href), ...QUICK_CREATE.map((i) => i.href)];
    expect(allHrefs.some((h) => h.includes("/conhecimento"))).toBe(false);
    expect(QUICK_CREATE.some((q) => q.href === "/crm?aba=empresas&novo=1")).toBe(true);
    expect(QUICK_CREATE.some((q) => q.href === "/crm?aba=propostas&novo=1")).toBe(true);
  });

  it("busca global omite Conhecimento e aponta contatos para o CRM unificado", async () => {
    const { globalSearch } = await import("@/lib/services/search");
    const hits = await globalSearch(
      { workspaceId: "00000000-0000-0000-0000-000000000001", userId: "u1", email: "a@b.com", role: "owner", actor: "user", scope: "write" },
      "Aurora",
    );
    expect(lastSql).not.toContain("crm_knowledge");
    expect(hits.find((h) => h.kind === "empresa")?.href).toBe("/empresas/c1");
    expect(hits.find((h) => h.kind === "contato")?.href).toBe("/crm?aba=empresas&sub=contatos&q=Ana");
  });
});
