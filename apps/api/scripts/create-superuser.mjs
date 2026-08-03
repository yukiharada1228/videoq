#!/usr/bin/env node
/**
 * Promote an existing user to superuser (and staff).
 *
 *   npm run user:superuser -- <username-or-email>
 *   DATABASE_URL=... npm run user:superuser -- alice
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

const ident = process.argv.slice(2).find((a) => !a.startsWith("-"));
if (!ident) {
  console.error("Usage: npm run user:superuser -- <username-or-email>");
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
  const { rows } = await client.query(
    `UPDATE users
        SET is_superuser = true,
            is_staff = true,
            is_active = true
      WHERE lower(username) = lower($1)
         OR lower(email) = lower($1)
      RETURNING id, username, email, is_superuser, is_staff, is_active`,
    [ident],
  );

  if (rows.length === 0) {
    console.error(`User not found: ${ident}`);
    console.error("Sign up first, then re-run this command.");
    process.exit(1);
  }

  const user = rows[0];
  console.log(
    `Superuser ready: id=${user.id} username=${user.username} email=${user.email}`,
  );
} finally {
  await client.end();
}
