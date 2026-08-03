#!/usr/bin/env node
/**
 * Existing DBs already have the Django-era schema. Stamp 0000_init as applied
 * so drizzle-kit migrate becomes a no-op until the next generate.
 *
 * Greenfield (no app_user): does nothing — migrate will create tables.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const databaseUrl =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:55432/postgres";

const sqlPath = join(root, "drizzle/0000_init.sql");
const hash = createHash("sha256").update(readFileSync(sqlPath)).digest("hex");
const when = 1754150400000;

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  const exists = await client.query(
    `SELECT to_regclass('public.app_user') IS NOT NULL AS ok`,
  );
  if (!exists.rows[0]?.ok) {
    console.log("stamp-baseline: empty DB — skip (migrate will apply 0000_init)");
    process.exit(0);
  }

  await client.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  const already = await client.query(
    `SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = $1 LIMIT 1`,
    [hash],
  );
  if (already.rowCount > 0) {
    console.log("stamp-baseline: 0000_init already stamped");
    process.exit(0);
  }

  // Clear bogus SELECT-1 baseline hashes if any leftover from early cutover.
  await client.query(`DELETE FROM drizzle.__drizzle_migrations`);
  await client.query(
    `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
    [hash, when],
  );
  console.log("stamp-baseline: stamped 0000_init", hash.slice(0, 16) + "…");
} finally {
  await client.end();
}
