import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { billingRoutes } from "../src/features/billing/routes";
import { PLAN_CATALOG } from "../src/features/billing/catalog";
import type { Bindings } from "../src/types/bindings";

const { constructEventAsync, subscriptionsRetrieve } = vi.hoisted(() => ({
  constructEventAsync: vi.fn(), subscriptionsRetrieve: vi.fn(),
}));
vi.mock("stripe", () => ({
  default: class {
    static createFetchHttpClient() { return {}; }
    webhooks = { constructEventAsync };
    subscriptions = { retrieve: subscriptionsRetrieve };
  },
}));

const databaseUrl = process.env.QUOTA_TEST_DATABASE_URL;
(databaseUrl ? describe : describe.skip)("billing webhook on PostgreSQL", () => {
  const schema = `billing_${crypto.randomUUID().replaceAll("-", "")}`;
  let admin: pg.Client;
  let env: Bindings;

  function subscription(status = "active", lookupKey = "pro_monthly") {
    return { id: "sub_1", customer: "cus_1", status, metadata: { userId: "user_1" },
      items: { data: [{ price: { lookup_key: lookupKey } }] } };
  }
  function invoice() {
    return { customer: "cus_1", metadata: {},
      parent: { subscription_details: { subscription: "sub_1" } } };
  }
  function event(type = "invoice.paid", object: unknown = invoice()) {
    return { id: "evt_1", type, data: { object } };
  }
  function deliver() {
    return billingRoutes.request("/webhook", { method: "POST",
      headers: { "stripe-signature": "t=1,v1=test" }, body: "{ \"untouched\": true }" }, env);
  }
  async function state() {
    const user = (await admin.query("SELECT * FROM users WHERE id = 'user_1'")).rows[0];
    const events = (await admin.query("SELECT id, type FROM stripe_events ORDER BY id")).rows;
    const updates = (await admin.query("SELECT * FROM billing_updates")).rows;
    return { user, events, updates };
  }
  function limits(plan: "free" | "basic" | "pro") {
    const e = PLAN_CATALOG[plan].entitlements;
    return { max_video_upload_size_mb: e.maxVideoUploadSizeMb, storage_limit_gb: e.storageLimitGb,
      processing_limit_minutes: e.processingLimitMinutes, ai_answers_limit: e.aiAnswersLimit };
  }

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: databaseUrl });
    await admin.connect();
    await admin.query(`
      CREATE SCHEMA "${schema}";
      SET search_path TO "${schema}";
      CREATE TABLE users (
        id text PRIMARY KEY, email text DEFAULT 'user@example.test',
        stripe_customer_id text UNIQUE, stripe_subscription_id text UNIQUE,
        plan_code text NOT NULL DEFAULT 'free', subscription_status text,
        quota_source text NOT NULL DEFAULT 'plan', updated_at timestamptz NOT NULL DEFAULT now(),
        max_video_upload_size_mb integer DEFAULT 200, storage_limit_gb double precision DEFAULT 1,
        processing_limit_minutes integer DEFAULT 45, ai_answers_limit integer DEFAULT 30
      );
      CREATE TABLE stripe_events (id text PRIMARY KEY, type text NOT NULL, processed_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE billing_updates (user_id text NOT NULL);
      CREATE FUNCTION track_billing_update() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN INSERT INTO billing_updates VALUES (NEW.id); RETURN NEW; END;
      $$;
      CREATE TRIGGER track_billing_update AFTER UPDATE ON users FOR EACH ROW EXECUTE FUNCTION track_billing_update();
    `);
    const url = new URL(databaseUrl!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    url.searchParams.set("application_name", schema);
    env = { HYPERDRIVE: { connectionString: url.toString() }, STRIPE_SECRET_KEY: "sk_test_billing",
      STRIPE_WEBHOOK_SECRET: "whsec_test", ENVIRONMENT: "development" } as Bindings;
  });
  beforeEach(async () => {
    constructEventAsync.mockReset().mockResolvedValue(event());
    subscriptionsRetrieve.mockReset().mockResolvedValue(subscription());
    await admin.query(`TRUNCATE users, stripe_events, billing_updates;
      INSERT INTO users (id, stripe_customer_id) VALUES ('user_1', 'cus_1'), ('user_2', 'cus_2')`);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await admin.end(); }
  });

  it("verifies the untouched body and persists the subscription with the event", async () => {
    expect((await deliver()).status).toBe(200);
    expect(constructEventAsync).toHaveBeenCalledExactlyOnceWith('{ "untouched": true }', "t=1,v1=test", "whsec_test");
    expect(await state()).toMatchObject({ user: { plan_code: "pro", subscription_status: "active",
      stripe_subscription_id: "sub_1", ...limits("pro") }, events: [{ id: "evt_1", type: "invoice.paid" }],
      updates: [{ user_id: "user_1" }] });
  });

  it("does not access the database or Stripe subscriptions for an invalid signature", async () => {
    constructEventAsync.mockRejectedValue(new Error("bad signature"));
    const connect = vi.spyOn(pg.Client.prototype, "connect");
    expect((await deliver()).status).toBe(400);
    expect(connect).not.toHaveBeenCalled();
    expect(subscriptionsRetrieve).not.toHaveBeenCalled();
  });

  it("retries the same event after a Stripe lookup failure without keeping a receipt", async () => {
    subscriptionsRetrieve.mockRejectedValueOnce(new Error("Stripe temporarily unavailable"));
    const before = await state();
    expect((await deliver()).status).toBe(500);
    expect(await state()).toEqual(before);
    expect((await deliver()).status).toBe(200);
    expect(subscriptionsRetrieve).toHaveBeenCalledTimes(2);
    expect((await state()).user.plan_code).toBe("pro");
  });

  it.each(["write", "commit"])("rolls back the event and all changes on %s failure, allowing redelivery", async failure => {
    await admin.query(`CREATE FUNCTION reject_billing_update() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Cannot apply billing update'; END; $$;
      ${failure === "commit"
        ? "CREATE CONSTRAINT TRIGGER reject_billing_update AFTER UPDATE ON users DEFERRABLE INITIALLY DEFERRED"
        : "CREATE TRIGGER reject_billing_update BEFORE UPDATE ON users"}
      FOR EACH ROW EXECUTE FUNCTION reject_billing_update()`);
    try {
      const before = await state();
      expect((await deliver()).status).toBe(500);
      expect(await state()).toEqual(before);
    } finally {
      await admin.query("DROP TRIGGER reject_billing_update ON users; DROP FUNCTION reject_billing_update()");
    }
    expect((await deliver()).status).toBe(200);
    expect((await state()).user.plan_code).toBe("pro");
  });

  it("skips Stripe and user writes for an already committed event", async () => {
    expect((await deliver()).status).toBe(200);
    const before = await state();
    subscriptionsRetrieve.mockRejectedValue(new Error("should never be called again"));
    expect((await deliver()).status).toBe(200);
    expect(subscriptionsRetrieve).toHaveBeenCalledTimes(1);
    expect(await state()).toEqual(before);
  });

  it("applies simultaneous duplicate deliveries only once", async () => {
    let release!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    let lookups = 0;
    subscriptionsRetrieve.mockImplementation(async () => {
      lookups++;
      if (lookups === 2) release();
      await ready;
      return subscription();
    });
    const first = deliver();
    const second = deliver();
    await vi.waitFor(() => expect(lookups).toBe(2)).catch(() => {});
    release();
    expect((await Promise.all([first, second])).map(res => res.status)).toEqual([200, 200]);
    expect(lookups).toBe(2);
    expect(await state()).toMatchObject({ events: [{ id: "evt_1" }], updates: [{ user_id: "user_1" }] });
  });

  it("closes database connections during Stripe I/O and preserves a new admin quota override", async () => {
    subscriptionsRetrieve.mockImplementation(async () => {
      expect((await admin.query("SELECT * FROM pg_stat_activity WHERE application_name = $1", [schema])).rows).toEqual([]);
      await admin.query("UPDATE users SET quota_source = 'admin', ai_answers_limit = 987 WHERE id = 'user_1'");
      return subscription();
    });
    expect((await deliver()).status).toBe(200);
    expect((await state()).user).toMatchObject({ quota_source: "admin", plan_code: "pro", ai_answers_limit: 987,
      max_video_upload_size_mb: 200, storage_limit_gb: 1, processing_limit_minutes: 45 });
  });

  it("lets a waiting duplicate recover when the first transaction fails", async () => {
    await admin.query(`CREATE SEQUENCE update_attempt;
      CREATE FUNCTION fail_first_update() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF nextval('update_attempt') = 1 THEN RAISE EXCEPTION 'First update fails'; END IF;
          RETURN NEW;
        END;
      $$;
      CREATE TRIGGER fail_first_update BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION fail_first_update()`);
    const writer = new pg.Client({ connectionString: env.HYPERDRIVE.connectionString });
    await writer.connect();
    let pending: Promise<Response[]> | undefined;
    try {
      await writer.query("BEGIN");
      await writer.query("SELECT id FROM users WHERE id = 'user_1' FOR UPDATE");
      pending = Promise.all([deliver(), deliver()]);
      await vi.waitFor(async () => {
        const blocked = await admin.query("SELECT 1 FROM pg_stat_activity WHERE application_name = $1 AND cardinality(pg_blocking_pids(pid)) > 0", [schema]);
        expect(blocked.rowCount).toBe(2);
      });
      // Neither a receipt nor a subscription update is visible before commit.
      expect(await state()).toMatchObject({ user: { plan_code: "free" }, events: [], updates: [] });
      await writer.query("COMMIT");
      expect((await pending).map(res => res.status).sort()).toEqual([200, 500]);
      expect(await state()).toMatchObject({ user: { plan_code: "pro" }, events: [{ id: "evt_1" }], updates: [{ user_id: "user_1" }] });
    } finally {
      await writer.query("ROLLBACK");
      await pending;
      await writer.end();
      await admin.query("DROP TRIGGER fail_first_update ON users; DROP FUNCTION fail_first_update(); DROP SEQUENCE update_attempt");
    }
  });

  it.each(["plan", "admin"])("uses the current %s quota source after waiting for the user row", async source => {
    const writer = new pg.Client({ connectionString: env.HYPERDRIVE.connectionString });
    await writer.connect();
    let pending: Promise<Response> | undefined;
    try {
      await admin.query("UPDATE users SET quota_source = 'admin', ai_answers_limit = 123 WHERE id = 'user_1'");
      await writer.query("BEGIN");
      await writer.query("UPDATE users SET quota_source = $1, ai_answers_limit = 987 WHERE id = 'user_1'", [source]);
      pending = deliver();
      await vi.waitFor(async () => {
        expect((await admin.query("SELECT 1 FROM pg_stat_activity WHERE application_name = $1 AND cardinality(pg_blocking_pids(pid)) > 0", [schema])).rowCount).toBe(1);
      });
      await writer.query("COMMIT");
      expect((await pending).status).toBe(200);
      expect((await state()).user).toMatchObject({ plan_code: "pro", quota_source: source, ai_answers_limit: source === "plan" ? 2500 : 987 });
    } finally {
      await writer.query("ROLLBACK");
      await pending;
      await writer.end();
    }
  });

  it.each(["active", "trialing", "past_due", "incomplete", "paused", "canceled", "unpaid", "incomplete_expired"])(
    "preserves subscription status handling for %s", async status => {
      constructEventAsync.mockResolvedValue(event("customer.subscription.updated", subscription(status, "basic_yearly")));
      expect((await deliver()).status).toBe(200);
      const active = ["active", "trialing", "past_due"].includes(status);
      const ended = ["canceled", "unpaid", "incomplete_expired"].includes(status);
      expect((await state()).user).toMatchObject({ plan_code: active ? "basic" : "free",
        subscription_status: ended ? "canceled" : status, stripe_subscription_id: ended ? null : "sub_1",
        ...limits(active ? "basic" : "free") });
      expect(subscriptionsRetrieve).not.toHaveBeenCalled();
    },
  );

  it("resolves checkout users from metadata and expanded customer/subscription objects", async () => {
    constructEventAsync.mockResolvedValue(event("checkout.session.completed", { metadata: { userId: "user_1" },
      customer: { id: "cus_1" }, subscription: { id: "sub_1" } }));
    expect((await deliver()).status).toBe(200);
    expect(subscriptionsRetrieve).toHaveBeenCalledExactlyOnceWith("sub_1");
    expect((await state()).user.plan_code).toBe("pro");
  });

  it.each(["checkout.session.completed", "customer.subscription.deleted"])("resets an ended %s subscription to free", async type => {
    await admin.query("UPDATE users SET plan_code = 'pro', subscription_status = 'active', stripe_subscription_id = 'sub_1' WHERE id = 'user_1'");
    const object = type === "checkout.session.completed"
      ? { client_reference_id: "user_1", customer: "cus_1", subscription: null }
      : subscription("canceled");
    constructEventAsync.mockResolvedValue(event(type, object));
    expect((await deliver()).status).toBe(200);
    expect((await state()).user).toMatchObject({ plan_code: "free", subscription_status: "canceled", stripe_subscription_id: null, ...limits("free") });
    expect(subscriptionsRetrieve).not.toHaveBeenCalled();
  });

  it("preserves existing Stripe IDs and quotas on an invoice failure without those IDs", async () => {
    await admin.query("UPDATE users SET stripe_subscription_id = 'sub_existing', plan_code = 'basic', ai_answers_limit = 777 WHERE id = 'user_1'");
    constructEventAsync.mockResolvedValue(event("invoice.payment_failed", { customer: null, metadata: { userId: "user_1" }, parent: null }));
    expect((await deliver()).status).toBe(200);
    expect((await state()).user).toMatchObject({ stripe_customer_id: "cus_1", stripe_subscription_id: "sub_existing",
      plan_code: "basic", subscription_status: "past_due", ai_answers_limit: 777 });
    expect(subscriptionsRetrieve).not.toHaveBeenCalled();
  });

  it.each(["missing_user", "missing_subscription", "unhandled"])("records %s events without changing users", async kind => {
    const object = invoice();
    if (kind === "missing_user") Object.assign(object, { metadata: { userId: "missing" } });
    if (kind === "missing_subscription") Object.assign(object, { parent: null });
    constructEventAsync.mockResolvedValue(event(kind === "unhandled" ? "invoice.created" : "invoice.paid", object));
    const before = (await state()).user;
    expect((await deliver()).status).toBe(200);
    expect(await state()).toMatchObject({ user: before, events: [{ id: "evt_1" }], updates: [] });
    expect(subscriptionsRetrieve).not.toHaveBeenCalled();
  });

});
