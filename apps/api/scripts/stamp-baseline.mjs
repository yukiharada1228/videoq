#!/usr/bin/env node
/**
 * Existing DBs already have schema from Django era and/or cutover.
 * Stamp 0000_init (and 0001_new_schema when modern tables exist) as applied
 * so drizzle-kit migrate does not re-run CREATE on a live DB.
 *
 * Greenfield (no app_user and no users): skip — migrate will apply from scratch.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const databaseUrl =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:55432/postgres";

function migrationHash(fileName) {
  const sqlPath = join(root, "drizzle", fileName);
  if (!existsSync(sqlPath)) return null;
  return createHash("sha256").update(readFileSync(sqlPath)).digest("hex");
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  const { rows } = await client.query(`
    SELECT
      to_regclass('public.app_user') IS NOT NULL AS has_legacy,
      to_regclass('public.users') IS NOT NULL AS has_modern
  `);
  const { has_legacy, has_modern } = rows[0];

  if (!has_legacy && !has_modern) {
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

  const stamps = [
    { file: "0000_init.sql", when: 1754150400000, label: "0000_init" },
  ];
  // Modern tables imply 0001 was applied (or ETL-created); stamp so migrate is a no-op.
  if (has_modern) {
    stamps.push({
      file: "0001_new_schema.sql",
      when: 1754208000000,
      label: "0001_new_schema",
    });
  }

  for (const s of stamps) {
    const hash = migrationHash(s.file);
    if (!hash) continue;
    const already = await client.query(
      `SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = $1 LIMIT 1`,
      [hash],
    );
    if (already.rowCount > 0) {
      console.log(`stamp-baseline: ${s.label} already stamped`);
      continue;
    }
    await client.query(
      `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`,
      [hash, s.when],
    );
    console.log(`stamp-baseline: stamped ${s.label}`, hash.slice(0, 16) + "…");
  }

  if (has_modern && !has_legacy) {
    console.log("stamp-baseline: modern-only DB (legacy tables absent) — OK");
  } else if (has_legacy && has_modern) {
    console.log("stamp-baseline: dual schema (legacy + modern) — OK");
  } else {
    console.log("stamp-baseline: legacy schema present — OK");
  }
} finally {
  await client.end();
}
