// Igual ao sql-capture, para as Server Actions e o cron. CAPTURE_SQL=1 para rodar.
import { writeFileSync } from "node:fs";

import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: () => {}, connection: async () => {} }));
vi.mock("@/lib/auth/require", () => ({ requireUser: async () => ({ id: "u" }), UnauthorizedError: class extends Error {} }));

const captured: { sql: string; params: unknown[] }[] = [];
const dialect = new PgDialect();
const PID = "00000000-0000-0000-0000-000000000002";
const LID = "00000000-0000-0000-0000-000000000004";
function exec(q: SQL) {
  const { sql, params } = dialect.sqlToQuery(q);
  captured.push({ sql, params });
  if (/returning id/.test(sql)) return Promise.resolve({ rows: [{ id: LID }] });
  if (/expired/.test(sql)) return Promise.resolve({ rows: [{ google_place_id: "ChIJ", expired: true }] });
  return Promise.resolve({ rows: [{ n: 0 }] });
}
vi.mock("@/lib/db", () => ({ db: { execute: exec }, pool: {} }));
vi.mock("@/lib/quota", () => ({ reserveCalls: async () => true }));
vi.mock("@/lib/places/google", () => ({
  placeDetails: async () => ({ id: "ChIJ", displayName: { text: "X" }, location: { latitude: -16.7, longitude: -49.27 } }),
}));
vi.mock("@/lib/queries", () => ({
  placeById: async () => ({
    id: PID, googlePlaceId: "ChIJ", name: "X", category: "barbearia", contacts: [{ kind: "whatsapp", value: "+5562999998888", source: "site_empresa", confirmed: true }],
    googlePhone: "+55 62 99999-8888", leadId: LID, optedOut: false, oldSite: [], rules: [],
  }),
  activitiesFor: async () => [],
}));

const run = process.env.CAPTURE_SQL === "1" ? describe : describe.skip;
run("captura SQL das ações", () => {
  it("gera", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "x";
    process.env.CRON_SECRET = "s";
    const a = await import("@/app/actions");
    await a.leadDetailAction(PID);
    await a.addToCrmAction([PID]);
    await a.markSentAction(PID, "whatsapp", "oi");
    await a.optOutAction(PID, "pediu");
    await a.moveStageAction(LID, "perdido", "sem interesse");
    await a.updateLeadAction(LID, { expectedValue: 700, nextStep: "ligar", nextStepAt: "2026-11-20T12:00:00.000Z" });
    await a.updateLeadAction(LID, { nextStep: null });
    await a.addActivityAction(LID, "resposta", "respondeu");
    const cron = await import("@/app/api/cron/purge/route");
    await cron.GET(new Request("http://x/api/cron/purge", { headers: { authorization: "Bearer s" } }));
    writeFileSync("/tmp/captured-actions.json", JSON.stringify(captured, null, 2));
    expect(captured.length).toBeGreaterThan(10);
  });
});
