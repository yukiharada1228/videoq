#!/usr/bin/env node
/**
 * Restore a credential password for an existing user in a local database.
 *
 *   npm run user:password:local -- <username-or-email>
 *   VIDEOQ_LOCAL_PASSWORD='at-least-12-characters' npm run user:password:local -- <username-or-email>
 */
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hashPassword } from "better-auth/crypto";
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
      .find((candidate) => /^DATABASE_URL=/.test(candidate));
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

const ident = process.argv.slice(2).find((arg) => !arg.startsWith("-"));
if (!ident) {
  console.error("Usage: npm run user:password:local -- <username-or-email>");
  process.exit(1);
}

let databaseUrl = loadDatabaseUrl();
if (/@postgres(?::|\/)/.test(databaseUrl)) {
  databaseUrl = databaseUrl.replace(/@postgres(?::\d+)?/, "@127.0.0.1:55432");
}

const databaseHost = new URL(databaseUrl).hostname;
if (!new Set(["127.0.0.1", "localhost", "::1"]).has(databaseHost)) {
  throw new Error(`Refusing to reset a password on non-local database host: ${databaseHost}`);
}

const configuredPassword = process.env.VIDEOQ_LOCAL_PASSWORD;
const password = configuredPassword || `Local-${randomBytes(15).toString("base64url")}`;
if (password.length < 12 || password.length > 128) {
  throw new Error("VIDEOQ_LOCAL_PASSWORD must be between 12 and 128 characters");
}
const passwordHash = await hashPassword(password);

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query("BEGIN");
  const userResult = await client.query(
    `SELECT id, username, email
       FROM users
      WHERE lower(username) = lower($1)
         OR lower(email) = lower($1)
      FOR UPDATE`,
    [ident],
  );
  if (userResult.rows.length === 0) {
    throw new Error(`User not found: ${ident}`);
  }

  const user = userResult.rows[0];
  const updatedAccount = await client.query(
    `UPDATE account
        SET password = $2,
            updated_at = now()
      WHERE user_id = $1
        AND provider_id = 'credential'`,
    [user.id, passwordHash],
  );
  if (updatedAccount.rowCount === 0) {
    await client.query(
      `INSERT INTO account
        (id, account_id, provider_id, user_id, password, created_at, updated_at)
       VALUES ($1, $2, 'credential', $2, $3, now(), now())`,
      [randomUUID(), user.id, passwordHash],
    );
  }

  await client.query(
    `UPDATE users
        SET password_reset_required = false,
            email_verified = true,
            is_active = true,
            updated_at = now()
      WHERE id = $1`,
    [user.id],
  );
  await client.query(`DELETE FROM session WHERE user_id = $1`, [user.id]);
  await client.query("COMMIT");

  console.log(`Local password restored: username=${user.username} email=${user.email}`);
  if (!configuredPassword) console.log(`Temporary password: ${password}`);
  console.log("All existing sessions for this user were revoked.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
