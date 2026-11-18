// Captura o SQL real gerado pelas funções (banco simulado) para validar com EXPLAIN no Neon.
// Roda só com CAPTURE_SQL=1: `CAPTURE_SQL=1 npx vitest run tests/sql-capture.test.ts`
import { writeFileSync } from "node:fs";

import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const captured: { sql: string; params: unknown[] }[] = [];
const dialect = new PgDialect();
let nextRows: unknown[][] = [];

function exec(q: SQL) {
  const { sql, params } = dialect.sqlToQuery(q);
  captured.push({ sql, params });
  return Promise.resolve({ rows: nextRows.shift() ?? [] });
}

vi.mock("@/lib/db", () => ({
  db: { execute: exec, transaction: async (fn: (tx: { execute: typeof exec }) => Promise<void>) => fn({ execute: exec }) },
  pool: {},
}));

vi.mock("@/lib/places/google", async (orig) => {
  const real = await orig<typeof import("@/lib/places/google")>();
  return {
    ...real,
    searchNearby: async () => [
      {
        id: "ChIJtest1",
        displayName: { text: "Barbearia Teste" },
        primaryType: "barber_shop",
        shortFormattedAddress: "R. 1, Setor Bueno",
        addressComponents: [{ longText: "Setor Bueno", shortText: "St. Bueno", types: ["sublocality_level_1", "sublocality"] }],
        location: { latitude: -16.7, longitude: -49.27 },
        businessStatus: "OPERATIONAL",
        rating: 4.8,
        userRatingCount: 120,
        nationalPhoneNumber: "(62) 99999-8888",
        googleMapsUri: "https://maps.google.com/?cid=1",
      },
    ],
  };
});

const run = process.env.CAPTURE_SQL === "1" ? describe : describe.skip;

run("captura SQL", () => {
  it("gera as consultas", async () => {
    const { runSearch } = await import("@/lib/places/search");
    const { processAuditBatch } = await import("@/lib/audit/process");
    const q = await import("@/lib/queries");
    const quota = await import("@/lib/quota");

    const SID = "00000000-0000-0000-0000-000000000001";
    const PID = "00000000-0000-0000-0000-000000000002";
    // runSearch: usage, reserve, insert search, optouts, upsert places, search_results, site_audits
    nextRows = [[{ total: 0 }], [{ ok: true }], [{ id: SID }], [], [{ id: PID, google_website: null }], [], []];
    const out = await runSearch({ category: "barbearia", center: { lat: -16.7, lng: -49.27 }, radiusM: 1000, label: "teste" });
    expect(out.ok).toBe(true);

    // processAuditBatch: requeue, claim, (auditOne: update audit, contacts, score), pending count
    nextRows = [[], [{ audit_id: "00000000-0000-0000-0000-000000000003", place_id: PID, url: "https://instagram.com/x", category: "barbearia", rating: "4.8", rating_count: 120, google_phone: "+5562999998888" }], [], [], [], [{ n: 0 }]];
    await processAuditBatch(5);

    nextRows = [[], [], []];
    await q.searchResults(SID);
    await q.recentSearches();
    await q.placeById(PID);
    await q.crmBoard();
    await q.activitiesFor("00000000-0000-0000-0000-000000000004");
    await quota.placesUsageThisMonth();
    await quota.countCall("places:details");

    writeFileSync("/tmp/captured-sql.json", JSON.stringify(captured, null, 2));
    expect(captured.length).toBeGreaterThan(10);
  });
});
