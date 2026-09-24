import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteUser } from "../src/features/admin/service";
import { processExternalTaskById } from "../src/lib/external-tasks";
import type { Bindings } from "../src/types/bindings";

vi.mock("../src/lib/external-tasks", () => ({ processExternalTaskById: vi.fn(async () => true) }));
const databaseUrl = process.env.QUOTA_TEST_DATABASE_URL;

(databaseUrl ? describe : describe.skip)("admin account deletion on PostgreSQL", () => {
  const schema = `admin_delete_${crypto.randomUUID().replaceAll("-", "")}`;
  let admin: pg.Client;
  let env: Bindings;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: databaseUrl });
    await admin.connect();
    await admin.query(`
      CREATE SCHEMA "${schema}";
      SET search_path TO "${schema}";
      CREATE TABLE users (
        id text PRIMARY KEY, role text, banned boolean DEFAULT false, ban_expires timestamptz,
        username text DEFAULT 'User', email text DEFAULT 'user@example.test', is_staff boolean DEFAULT false,
        max_video_upload_size_mb integer DEFAULT 500, storage_limit_gb integer DEFAULT 10,
        processing_limit_minutes integer DEFAULT 60, ai_answers_limit integer DEFAULT 100,
        used_storage_bytes bigint DEFAULT 0, used_processing_seconds integer DEFAULT 0,
        used_ai_answers integer DEFAULT 0, usage_period_start timestamptz,
        is_over_quota boolean DEFAULT false, plan_code text DEFAULT 'free', quota_source text DEFAULT 'plan'
      );
      CREATE TABLE session (id text PRIMARY KEY, user_id text REFERENCES users ON DELETE CASCADE);
      CREATE TABLE oauth_access_token (id text PRIMARY KEY, user_id text REFERENCES users ON DELETE CASCADE);
      CREATE TABLE oauth_consent (id text PRIMARY KEY, user_id text REFERENCES users ON DELETE CASCADE);
      CREATE TABLE oauth_refresh_token (id text PRIMARY KEY, user_id text REFERENCES users ON DELETE CASCADE, revoked timestamptz);
      CREATE TABLE external_tasks (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        kind text NOT NULL, payload jsonb NOT NULL, dedupe_key text NOT NULL UNIQUE,
        attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
        locked_at timestamptz, completed_at timestamptz, dead_at timestamptz,
        effect_applied_at timestamptz, last_error text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const url = new URL(databaseUrl!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    url.searchParams.set("application_name", schema);
    env = { HYPERDRIVE: { connectionString: url.toString() } } as Bindings;
  });
  beforeEach(async () => {
    vi.mocked(processExternalTaskById).mockClear();
    await admin.query(`
      TRUNCATE users, session, oauth_access_token, oauth_consent, oauth_refresh_token, external_tasks;
      INSERT INTO users (id, role, ban_expires) VALUES ('target', 'user', now() + interval '1 day'), ('actor', 'admin', NULL);
      INSERT INTO session VALUES ('target-session', 'target'), ('actor-session', 'actor');
      INSERT INTO oauth_access_token VALUES ('target-access', 'target'), ('actor-access', 'actor');
      INSERT INTO oauth_consent VALUES ('target-consent', 'target'), ('actor-consent', 'actor');
      INSERT INTO oauth_refresh_token VALUES ('target-refresh', 'target', NULL), ('actor-refresh', 'actor', NULL);
    `);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await admin.end(); }
  });

  async function snapshot() {
    const tables = ["users", "session", "oauth_access_token", "oauth_consent", "oauth_refresh_token", "external_tasks"];
    const rows = [];
    for (const table of tables) rows.push((await admin.query(`SELECT * FROM ${table} ORDER BY id`)).rows);
    return rows;
  }

  it("checks the target role, revokes credentials and persists the job in one connection", async () => {
    const connect = vi.spyOn(pg.Client.prototype, "connect");
    const result = await deleteUser(env, "actor", "target");
    expect(connect).toHaveBeenCalledTimes(1);
    const [users, sessions, accessTokens, consents, refreshTokens, tasks] = await snapshot();
    expect(users.find(user => user.id === "target")).toMatchObject({ banned: true, ban_expires: null });
    expect(users.find(user => user.id === "actor").banned).toBe(false);
    expect(sessions.map(row => row.id)).toEqual(["actor-session"]);
    expect(accessTokens.map(row => row.id)).toEqual(["actor-access"]);
    expect(consents.map(row => row.id)).toEqual(["actor-consent"]);
    expect(refreshTokens.find(row => row.id === "target-refresh").revoked).toBeInstanceOf(Date);
    expect(refreshTokens.find(row => row.id === "actor-refresh").revoked).toBeNull();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ kind: "sqs_job", dedupe_key: "account-delete:target", payload: {
      message: { type: "delete_account_data", payload: { user_id: "target" } },
    } });
    expect(result).toEqual({ job_id: tasks[0].payload.message.job_id });
    expect(processExternalTaskById).toHaveBeenCalledExactlyOnceWith(env, Number(tasks[0].id));
  });

  it.each(["admin", "user,admin"])("does not change an account with role %s", async role => {
    await admin.query("UPDATE users SET role = $1 WHERE id = 'target'", [role]);
    const before = await snapshot();
    expect(await deleteUser(env, "actor", "target")).toEqual({ forbiddenSuperuser: true });
    expect(await snapshot()).toEqual(before);
    expect(processExternalTaskById).not.toHaveBeenCalled();
  });

  it.each([null, "user", "administrator"])("allows a non-admin role: %s", async role => {
    await admin.query("UPDATE users SET role = $1 WHERE id = 'target'", [role]);
    expect(await deleteUser(env, "actor", "target")).toHaveProperty("job_id");
  });

  it("returns not found without revoking another user's credentials", async () => {
    const before = await snapshot();
    expect(await deleteUser(env, "actor", "missing")).toEqual({ notFound: true });
    expect(await snapshot()).toEqual(before);
    expect(processExternalTaskById).not.toHaveBeenCalled();
  });

  it("rejects self-deletion before connecting", async () => {
    const connect = vi.spyOn(pg.Client.prototype, "connect");
    expect(await deleteUser(env, "actor", "actor")).toEqual({ self: true });
    expect(connect).not.toHaveBeenCalled();
    expect(processExternalTaskById).not.toHaveBeenCalled();
  });

  it.each(["promotion", "deletion"])("observes a concurrent %s after the target row lock is released", async change => {
    const writer = new pg.Client({ connectionString: databaseUrl });
    await writer.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await writer.query(`SET search_path TO "${schema}"`);
      await writer.query("BEGIN");
      await writer.query("SELECT id FROM users WHERE id = 'target' FOR UPDATE");
      pending = deleteUser(env, "actor", "target").catch(error => error);
      await vi.waitFor(async () => {
        const blocked = await admin.query("SELECT 1 FROM pg_stat_activity WHERE application_name = $1 AND cardinality(pg_blocking_pids(pid)) > 0", [schema]);
        expect(blocked.rowCount).toBe(1);
      });
      await writer.query(change === "promotion"
        ? "UPDATE users SET role = 'user,admin' WHERE id = 'target'"
        : "DELETE FROM users WHERE id = 'target'");
      await writer.query("COMMIT");
      expect(await pending).toEqual(change === "promotion" ? { forbiddenSuperuser: true } : { notFound: true });
      expect((await admin.query("SELECT * FROM external_tasks")).rows).toEqual([]);
      expect(processExternalTaskById).not.toHaveBeenCalled();
      if (change === "promotion") {
        expect((await admin.query("SELECT banned FROM users WHERE id = 'target'")).rows[0].banned).toBe(false);
        expect((await admin.query("SELECT * FROM session WHERE user_id = 'target'")).rowCount).toBe(1);
      }
    } finally {
      await writer.query("ROLLBACK");
      await pending;
      await writer.end();
    }
  });

  it.each([false, true])("returns the persisted job identity on repeated deletes (concurrent=%s)", async concurrent => {
    const first = deleteUser(env, "actor", "target");
    if (!concurrent) await first;
    const results = await Promise.all([first, deleteUser(env, "actor", "target")]);
    const tasks = (await admin.query("SELECT * FROM external_tasks")).rows;
    expect(tasks).toHaveLength(1);
    expect(results).toEqual([{ job_id: tasks[0].payload.message.job_id }, { job_id: tasks[0].payload.message.job_id }]);
    expect(processExternalTaskById).toHaveBeenCalledTimes(2);
    expect(vi.mocked(processExternalTaskById).mock.calls.map(call => call[1])).toEqual([Number(tasks[0].id), Number(tasks[0].id)]);
  });

  it("rolls back the ban and all credential revocations if outbox persistence fails", async () => {
    await admin.query(`
      CREATE FUNCTION reject_deletion_job() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Cannot persist deletion job'; END;
      $$;
      CREATE TRIGGER reject_deletion_job BEFORE INSERT ON external_tasks FOR EACH ROW EXECUTE FUNCTION reject_deletion_job();
    `);
    try {
      const before = await snapshot();
      await expect(deleteUser(env, "actor", "target")).rejects.toThrow();
      expect(await snapshot()).toEqual(before);
      expect(processExternalTaskById).not.toHaveBeenCalled();
    } finally {
      await admin.query("DROP TRIGGER reject_deletion_job ON external_tasks; DROP FUNCTION reject_deletion_job()");
    }
  });
});
