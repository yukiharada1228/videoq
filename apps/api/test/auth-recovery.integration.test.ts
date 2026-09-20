import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { schema } from "../src/db/schema";
import { createAuth } from "../src/lib/auth";
import { createDpopReplayStore } from "better-auth/oauth2";
import type { Bindings } from "../src/types/bindings";

const databaseUrl = process.env.QUOTA_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("recovery link invalidation with PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl });
  const makeAuth = () => createAuth({
    ENVIRONMENT: "production", BETTER_AUTH_URL: "https://recovery-test.example",
    BETTER_AUTH_SECRET: "isolated-recovery-pg-secret-012345678901234567890123",
  } as Bindings, drizzle(client, { schema }));

  beforeAll(async () => {
    await client.connect();
    // A connection-local table keeps application data outside the test.
    await client.query(`
      CREATE TEMP TABLE oauth_resource (
        id text PRIMARY KEY, identifier text UNIQUE NOT NULL, name text NOT NULL,
        access_token_ttl integer, refresh_token_ttl integer, signing_algorithm text,
        signing_key_id text, allowed_scopes text[], custom_claims jsonb,
        dpop_bound_access_tokens_required boolean NOT NULL DEFAULT false,
        disabled boolean NOT NULL DEFAULT false, created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now(), policy_version integer NOT NULL DEFAULT 1, metadata jsonb
      );
      CREATE TEMP TABLE verification (
        id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL,
        expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
  });
  beforeEach(async () => {
    await client.query(`
      TRUNCATE pg_temp.verification;
      INSERT INTO verification (id, identifier, value, expires_at) VALUES
        ('reset-1', 'reset-password:one', 'owner', now() + interval '1 hour'),
        ('reset-2', 'reset-password:two', 'owner', now() + interval '1 hour'),
        ('other-user', 'reset-password:three', 'other', now() + interval '1 hour'),
        ('other-purpose', 'oauth-code', 'owner', now() + interval '1 hour');
    `);
  });
  afterAll(async () => { await client.end(); });

  it("uses Better Auth's atomic DB reservation across auth instances for DPoP replay", async () => {
    const contexts = await Promise.all([makeAuth().$context, makeAuth().$context]);
    const stores = contexts.map((context) => createDpopReplayStore(context.internalAdapter));
    const now = new Date();
    const proof = { key: "same-proof", now, expiresAt: new Date(now.getTime() + 300_000) };
    const accepted = await Promise.all(stores.map((store) => store.reserve(proof)));
    expect(accepted.filter(Boolean)).toHaveLength(1);
    expect(await stores[1].reserve(proof)).toBe(false);
    expect(await stores[1].reserve({ ...proof, key: "new-proof" })).toBe(true);
  });

  it("deletes only the verified user's password reset values through the real Drizzle adapter", async () => {
    const context = await makeAuth().$context;
    for (const value of ["owner", "other"]) {
      await context.internalAdapter.createVerificationValue({
        identifier: `reset-password:hashed-${value}`, value, expiresAt: new Date(Date.now() + 60_000),
      });
    }
    await context.options.emailVerification!.afterEmailVerification!({
      id: "owner", email: "verified@example.test", emailVerified: true, name: "Owner",
      createdAt: new Date(), updatedAt: new Date(),
    });

    expect((await client.query("SELECT id FROM verification WHERE value = 'owner'")).rows).toEqual([
      { id: "other-purpose" },
    ]);
    expect((await client.query("SELECT id FROM verification WHERE value = 'other'")).rows).toHaveLength(2);
  });

  it("stores a digest, resolves the original link and consumes it only once", async () => {
    const context = await makeAuth().$context;
    const identifier = "reset-password:isolated-postgres-token";
    const stored = await context.internalAdapter.createVerificationValue({
      identifier, value: "owner", expiresAt: new Date(Date.now() + 60_000),
    });
    const row = (await client.query("SELECT identifier FROM verification WHERE id = $1", [stored.id])).rows[0];
    expect(row.identifier).toMatch(/^reset-password-sha256:[a-f0-9]{64}$/);
    expect(row.identifier).not.toContain("isolated-postgres-token");
    expect(await context.internalAdapter.findVerificationValue(identifier)).toMatchObject({ id: stored.id });
    for (const token of [row.identifier, row.identifier.split(":").at(-1)]) {
      expect(await context.internalAdapter.consumeVerificationValue(`reset-password:${token}`)).toBeNull();
    }
    expect(await context.internalAdapter.consumeVerificationValue(identifier)).toMatchObject({ id: stored.id });
    expect(await context.internalAdapter.consumeVerificationValue(identifier)).toBeNull();
    // Deployment does not break unexpired links issued before hashing was enabled.
    expect(await context.internalAdapter.consumeVerificationValue("reset-password:one")).toMatchObject({ id: "reset-1" });
    expect(await context.internalAdapter.consumeVerificationValue("reset-password:one")).toBeNull();
  });
});
