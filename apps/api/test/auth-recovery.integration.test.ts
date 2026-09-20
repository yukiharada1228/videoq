import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { schema } from "../src/db/schema";
import { createAuth } from "../src/lib/auth";
import type { Bindings } from "../src/types/bindings";

const databaseUrl = process.env.QUOTA_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("recovery link invalidation with PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl });

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
      INSERT INTO verification (id, identifier, value, expires_at) VALUES
        ('reset-1', 'reset-password:one', 'owner', now() + interval '1 hour'),
        ('reset-2', 'reset-password:two', 'owner', now() + interval '1 hour'),
        ('other-user', 'reset-password:three', 'other', now() + interval '1 hour'),
        ('other-purpose', 'oauth-code', 'owner', now() + interval '1 hour');
    `);
  });
  afterAll(async () => { await client.end(); });

  it("deletes only the verified user's password reset values through the real Drizzle adapter", async () => {
    const auth = createAuth({
      ENVIRONMENT: "production", BETTER_AUTH_URL: "https://recovery-test.example",
      BETTER_AUTH_SECRET: "isolated-recovery-pg-secret-012345678901234567890123",
    } as Bindings, drizzle(client, { schema }));
    const context = await auth.$context;
    await context.options.emailVerification!.afterEmailVerification!({
      id: "owner", email: "verified@example.test", emailVerified: true, name: "Owner",
      createdAt: new Date(), updatedAt: new Date(),
    });

    expect((await client.query("SELECT id FROM verification ORDER BY id")).rows).toEqual([
      { id: "other-purpose" }, { id: "other-user" },
    ]);
  });
});
