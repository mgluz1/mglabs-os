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
    const search = await import("@/lib/places/search");
    const quota = await import("@/lib/quota");

    const SID = "00000000-0000-0000-0000-000000000001";
    const PID = "00000000-0000-0000-0000-000000000002";
    // runSearch (Overture): select ov_places, insert search, upsert places, search_results, contatos, site_audits
    nextRows = [
      [{ id: "ov1", name: "Barbearia Teste", brand: null, confidence: "0.93", websites: ["https://ig.com"], socials: ["https://instagram.com/x"], emails: ["a@b.com"], phones: ["+5562999998888"], address: "R. 1 - St. Bueno", locality: "Goiânia", source_count: 2, lat: -16.7, lng: -49.27 }],
      [{ id: SID }],
      [{ id: PID, overture_id: "ov1" }],
      [],
      [],
      [],
    ];
    const out = await runSearch({ category: "barbearia", center: { lat: -16.7, lng: -49.27 }, radiusM: 1000, label: "teste" });
    expect(out.ok).toBe(true);

    // processAuditBatch: requeue, claim, (auditOne: update audit, contacts, score), pending count
    nextRows = [[], [{ audit_id: "00000000-0000-0000-0000-000000000003", place_id: PID, url: "https://instagram.com/x", category: "barbearia", rating: null, rating_count: null, google_phone: "+5562999998888", confidence: "0.9", source_count: 2 }], [{ kind: "email", value: "a@b.com" }], [], [], [], [{ n: 0 }]];
    await processAuditBatch(5);

    nextRows = [[], [], []];
    await q.searchResults(SID);
    await q.recentSearches();
    await q.placeById(PID);
    await q.crmBoard();
    await q.activitiesFor("00000000-0000-0000-0000-000000000004");
    await quota.placesUsageThisMonth();
    nextRows = [[{ total: 1, release: "x", loaded_at: null }]];
    await search.radarInfo();
    await quota.countCall("places:details");

    writeFileSync("/tmp/captured-sql.json", JSON.stringify(captured, null, 2));
    expect(captured.length).toBeGreaterThan(10);
  });
});
