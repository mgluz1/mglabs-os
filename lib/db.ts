import "server-only";

import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/db/schema";

// node-postgres + pool, como recomendam as skills do Neon para Next.js na Vercel
// (Fluid compute). Usa a connection string POOLED (host com -pooler).
const globalForDb = globalThis as unknown as { pgPool?: Pool };

const pool =
  globalForDb.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") globalForDb.pgPool = pool;

// Na Vercel, fecha conexões ociosas antes de a função ser suspensa.
attachDatabasePool(pool);

export const db = drizzle(pool, { schema });
export { pool };
