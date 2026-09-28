import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listUsers } from "../src/features/admin/service";
import type { Bindings } from "../src/types/bindings";

const databaseUrl = process.env.QUOTA_TEST_DATABASE_URL;

(databaseUrl ? describe : describe.skip)("admin user search on PostgreSQL", () => {
  const schema = `admin_list_${crypto.randomUUID().replaceAll("-", "")}`;
  let admin: pg.Client;
  let env: Bindings;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: databaseUrl });
    await admin.connect();
    await admin.query(`
      CREATE SCHEMA "${schema}";
      SET search_path TO "${schema}";
      CREATE TABLE users (
        id text PRIMARY KEY, username text NOT NULL, email text NOT NULL,
        role text DEFAULT 'user', banned boolean DEFAULT false, ban_expires timestamptz,
        is_staff boolean DEFAULT false, max_video_upload_size_mb integer DEFAULT 200,
        storage_limit_gb double precision DEFAULT 1, processing_limit_minutes integer DEFAULT 45,
        ai_answers_limit integer DEFAULT 30, used_storage_bytes bigint DEFAULT 0,
        used_processing_seconds integer DEFAULT 0, used_ai_answers integer DEFAULT 0,
        usage_period_start timestamptz, is_over_quota boolean DEFAULT false,
        plan_code text DEFAULT 'free', quota_source text DEFAULT 'plan'
      );
    `);
    const url = new URL(databaseUrl!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    env = { HYPERDRIVE: { connectionString: url.toString() } } as Bindings;
  });
  beforeEach(() => admin.query("TRUNCATE users"));
  afterAll(async () => {
    try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await admin.end(); }
  });

  it.each(["username", "email"].flatMap(field => ["_", "%", "\\"].map(character => ({ field, character }))))(
    "searches $character literally in $field, including totals and pagination", async ({ field, character }) => {
      const values = [`alpha${character}beta`, "alphaXbeta", "alphabeta"];
      for (const [index, value] of values.entries()) {
        await admin.query("INSERT INTO users (id, username, email) VALUES ($1, $2, $3)", [
          String(index + 1), field === "username" ? value : `person${index}`,
          field === "email" ? `${value}@example.test` : `person${index}@example.test`,
        ]);
      }
      const query = `ALPHA${character}BETA`;
      const result = await listUsers(env, query, 1, 0);
      expect(result.count).toBe(1);
      expect(result.results.map(user => user.id)).toEqual(["1"]);
      await expect(listUsers(env, query, 1, 1)).resolves.toEqual({ count: 1, results: [] });

      const unfiltered = await listUsers(env, "", 2, 1);
      expect(unfiltered.count).toBe(3);
      expect(unfiltered.results.map(user => user.id)).toEqual(["2", "3"]);
    },
  );
});
