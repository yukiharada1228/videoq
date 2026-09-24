import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { patchQuota } from "../src/features/admin/service";
import { PLAN_CATALOG } from "../src/features/billing/catalog";
import type { Bindings } from "../src/types/bindings";

const databaseUrl = process.env.QUOTA_TEST_DATABASE_URL;

(databaseUrl ? describe : describe.skip)("admin quota updates on PostgreSQL", () => {
  const schema = `admin_quota_${crypto.randomUUID().replaceAll("-", "")}`;
  let admin: pg.Client;
  let env: Bindings;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: databaseUrl });
    await admin.connect();
    await admin.query(`
      CREATE SCHEMA "${schema}";
      SET search_path TO "${schema}";
      CREATE TABLE users (
        id text PRIMARY KEY, role text DEFAULT 'user', banned boolean DEFAULT false, ban_expires timestamptz,
        username text DEFAULT 'User', email text DEFAULT 'user@example.test', is_staff boolean DEFAULT true,
        max_video_upload_size_mb integer DEFAULT 999, storage_limit_gb double precision DEFAULT 12.5,
        processing_limit_minutes integer DEFAULT 123, ai_answers_limit integer DEFAULT 456,
        used_storage_bytes bigint DEFAULT 1024, used_processing_seconds integer DEFAULT 60,
        used_ai_answers integer DEFAULT 7, usage_period_start timestamptz DEFAULT '2026-09-01T00:00:00Z',
        is_over_quota boolean DEFAULT true, plan_code text DEFAULT 'basic', subscription_status text DEFAULT 'active',
        quota_source text DEFAULT 'admin', updated_at timestamptz DEFAULT '2026-09-01T00:00:00Z'
      );
      CREATE TABLE quota_updates (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_state jsonb NOT NULL);
      CREATE FUNCTION track_quota_update() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN INSERT INTO quota_updates (user_state) VALUES (to_jsonb(NEW)); RETURN NEW; END;
      $$;
      CREATE TRIGGER track_quota_update AFTER UPDATE ON users FOR EACH ROW EXECUTE FUNCTION track_quota_update();
    `);
    const url = new URL(databaseUrl!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    url.searchParams.set("application_name", schema);
    env = { HYPERDRIVE: { connectionString: url.toString() } } as Bindings;
  });
  beforeEach(async () => {
    await admin.query(`
      DROP TRIGGER IF EXISTS reject_quota_update ON users;
      TRUNCATE users, quota_updates;
      INSERT INTO users (id) VALUES ('target'), ('other');
    `);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await admin.end(); }
  });

  async function state() {
    return {
      users: (await admin.query("SELECT * FROM users ORDER BY id")).rows,
      updates: (await admin.query("SELECT user_state FROM quota_updates ORDER BY id")).rows,
    };
  }

  function limits(plan: "free" | "basic" | "pro") {
    const e = PLAN_CATALOG[plan].entitlements;
    return { max_video_upload_size_mb: e.maxVideoUploadSizeMb, storage_limit_gb: e.storageLimitGb,
      processing_limit_minutes: e.processingLimitMinutes, ai_answers_limit: e.aiAnswersLimit };
  }

  it.each([
    ["free", "active", "free"], ["basic", "active", "basic"], ["pro", "active", "pro"],
    ["basic", "trialing", "basic"], ["pro", "past_due", "pro"], ["pro", "canceled", "free"],
    ["pro", "incomplete", "free"], ["basic", null, "free"], ["unknown", "active", "free"],
  ] as const)("resets %s/%s to %s limits in one connection and one update", async (plan, status, expectedPlan) => {
    await admin.query("UPDATE users SET plan_code = $1, subscription_status = $2 WHERE id = 'target'", [plan, status]);
    await admin.query("TRUNCATE quota_updates");
    const before = await state();
    const connect = vi.spyOn(pg.Client.prototype, "connect");
    const result = await patchQuota(env, "target", { quota_source: "plan" });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ id: "target", quota_source: "plan", plan_code: plan, ...limits(expectedPlan),
      is_staff: true, is_active: true, is_superuser: false, used_storage_bytes: 1024,
      used_processing_seconds: 60, used_ai_answers: 7, is_over_quota: true });
    const after = await state();
    expect(after.updates).toHaveLength(1);
    expect(after.updates[0].user_state).toMatchObject({ quota_source: "plan", ...limits(expectedPlan) });
    expect(after.users.find(row => row.id === "other")).toEqual(before.users.find(row => row.id === "other"));
    expect(after.users.find(row => row.id === "target")).toMatchObject({
      ...before.users.find(row => row.id === "target"), ...limits(expectedPlan), quota_source: "plan", updated_at: expect.any(Date),
    });
  });

  it("does not persist custom limits supplied together with a reset to plan", async () => {
    await expect(patchQuota(env, "target", { quota_source: "plan", storage_limit_gb: null, ai_answers_limit: 9999 }))
      .resolves.toMatchObject({ quota_source: "plan", ...limits("basic") });
    const { updates } = await state();
    expect(updates).toHaveLength(1);
    expect(updates[0].user_state).toMatchObject({ quota_source: "plan", ...limits("basic") });
  });

  it("rolls back the quota source as well as the limits if resetting fails", async () => {
    await admin.query(`
      CREATE OR REPLACE FUNCTION reject_plan_quota() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.max_video_upload_size_mb = 1024 THEN RAISE EXCEPTION 'quota reset rejected'; END IF;
          RETURN NEW;
        END;
      $$;
      CREATE TRIGGER reject_quota_update BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION reject_plan_quota();
    `);
    const before = await state();
    await expect(patchQuota(env, "target", { quota_source: "plan" })).rejects.toThrow();
    expect(await state()).toEqual(before);
  });

  it("returns null for a missing user without updating another account", async () => {
    const before = await state();
    await expect(patchQuota(env, "missing", { quota_source: "plan" })).resolves.toBeNull();
    expect(await state()).toEqual(before);
  });

  it.each(["plan", "admin", "deleted"])("uses the current plan after a concurrent %s change", async change => {
    const writer = new pg.Client({ connectionString: databaseUrl });
    await writer.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await writer.query(`SET search_path TO "${schema}"`);
      await writer.query("BEGIN");
      await writer.query("SELECT 1 FROM users WHERE id = 'target' FOR UPDATE");
      pending = patchQuota(env, "target", { quota_source: "plan" }).catch(error => error);
      await vi.waitFor(async () => {
        expect((await admin.query("SELECT 1 FROM pg_stat_activity WHERE application_name = $1 AND cardinality(pg_blocking_pids(pid)) > 0", [schema])).rowCount).toBe(1);
      });
      await writer.query(change === "deleted"
        ? "DELETE FROM users WHERE id = 'target'"
        : "UPDATE users SET plan_code = 'pro', subscription_status = 'active', quota_source = $1 WHERE id = 'target'", change === "deleted" ? [] : [change]);
      await writer.query("COMMIT");
      const result = await pending;
      if (change === "deleted") expect(result).toBeNull();
      else expect(result).toMatchObject({ plan_code: "pro", quota_source: "plan", ...limits("pro") });
    } finally {
      await writer.query("ROLLBACK");
      await pending;
      await writer.end();
    }
  });

  it.each([undefined, "admin"] as const)("keeps unrelated limits when setting a custom quota (source=%s)", async source => {
    const before = await state();
    const connect = vi.spyOn(pg.Client.prototype, "connect");
    await expect(patchQuota(env, "target", { storage_limit_gb: null, ...(source ? { quota_source: source } : {}) }))
      .resolves.toMatchObject({ storage_limit_gb: null, quota_source: "admin", max_video_upload_size_mb: 999 });
    expect(connect).toHaveBeenCalledTimes(1);
    const after = await state();
    expect(after.updates).toHaveLength(1);
    expect(after.users.find(row => row.id === "target")).toEqual({
      ...before.users.find(row => row.id === "target"), storage_limit_gb: null,
    });
  });

  it("does not write for an empty patch", async () => {
    const before = await state();
    await expect(patchQuota(env, "target", {})).resolves.toMatchObject({ id: "target" });
    expect(await state()).toEqual(before);
  });
});
