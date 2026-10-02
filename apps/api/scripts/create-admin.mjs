#!/usr/bin/env node
/**
 * Promote an existing user to administrator.
 *
 *   npm run user:admin -- <username-or-email>
 *   npm run user:admin -- --id <user-id>
 *   DATABASE_URL=... npm run user:admin -- alice
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const rel of [".env", "apps/api/.env"]) {
    const path = join(repoRoot, rel);
    if (!existsSync(path)) continue;
    const line = readFileSync(path, "utf8")
      .split("\n")
      .find((l) => /^DATABASE_URL=/.test(l));
    if (!line) continue;
    let value = line.slice("DATABASE_URL=".length).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return "postgresql://postgres:postgres@127.0.0.1:55432/postgres";
}

const args = process.argv.slice(2);
const byId = args[0] === "--id";
const ident = (byId ? args[1] : args[0])?.trim();
if (!ident || args.length !== (byId ? 2 : 1) || (!byId && ident.startsWith("-"))) {
  console.error("Usage: npm run user:admin -- <username-or-email> | --id <user-id>");
  process.exit(1);
}

let databaseUrl = loadDatabaseUrl();
// Host-side runs cannot resolve the Compose service hostname `postgres`.
if (/@postgres(?::|\/)/.test(databaseUrl)) {
  databaseUrl = databaseUrl.replace(/@postgres(?::\d+)?/, "@127.0.0.1:55432");
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query("BEGIN");
  const matches = await client.query(
    `SELECT id FROM users WHERE ${byId ? "id = $1" : "lower(username) = lower($1) OR lower(email) = lower($1)"} FOR UPDATE`,
    [ident],
  );
  if (matches.rows.length === 0) {
    throw new Error(`User not found: ${ident}. Sign up first, then re-run this command.`);
  }
  if (matches.rows.length !== 1) {
    throw new Error("Multiple users match. No accounts were changed. Specify --id <user-id>.");
  }
  const { rows } = await client.query(
    `UPDATE users
        SET role = 'admin',
            banned = false,
            ban_expires = NULL,
            ban_reason = NULL,
            email_verified = true,
            updated_at = now()
      WHERE id = $1
      RETURNING id, username, email, banned, role`,
    [matches.rows[0].id],
  );

  await client.query("COMMIT");
  const user = rows[0];
  console.log(
    `Admin ready: id=${user.id} username=${user.username} email=${user.email}`,
  );
} catch (error) {
  await client.query("ROLLBACK");
  console.error(error instanceof Error ? error.message : "Administrator promotion failed.");
  process.exitCode = 1;
} finally {
  await client.end();
}
