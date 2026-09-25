import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { rebuildPlog } from "../src/features/plog/service";
import { processExternalTaskById } from "../src/lib/external-tasks";
import type { Bindings } from "../src/types/bindings";

vi.mock("../src/lib/external-tasks", () => ({ processExternalTaskById: vi.fn(async () => false) }));

const databaseUrl = process.env.QUOTA_TEST_DATABASE_URL;

(databaseUrl ? describe : describe.skip)("PLOG rebuild admission on PostgreSQL", () => {
  const schema = `plog_rebuild_${crypto.randomUUID().replaceAll("-", "")}`;
  let admin: pg.Client;
  let env: Bindings;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: databaseUrl });
    await admin.connect();
    await admin.query(`
      CREATE SCHEMA "${schema}";
      SET search_path TO "${schema}";
      CREATE TABLE videos (id bigint PRIMARY KEY, user_id text NOT NULL, transcript text);
      CREATE TABLE plog_build_jobs (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        video_id bigint NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
        status text NOT NULL, error_message text NOT NULL, input_tokens integer NOT NULL,
        output_tokens integer NOT NULL, created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL, finished_at timestamptz
      );
      CREATE UNIQUE INDEX active_build ON plog_build_jobs(video_id) WHERE status IN ('pending', 'running');
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
      DROP TRIGGER IF EXISTS reject_task ON external_tasks;
      TRUNCATE videos, plog_build_jobs, external_tasks RESTART IDENTITY;
      INSERT INTO videos VALUES (10, 'owner', 'Transcript'), (20, 'other', 'Private transcript');
    `);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await admin.end(); }
  });

  async function snapshot() {
    return {
      jobs: (await admin.query("SELECT * FROM plog_build_jobs ORDER BY id")).rows,
      tasks: (await admin.query("SELECT * FROM external_tasks ORDER BY id")).rows,
    };
  }

  async function seedJob(status: string) {
    await admin.query(`INSERT INTO plog_build_jobs
      (video_id, status, error_message, input_tokens, output_tokens, created_at, updated_at)
      VALUES (10, $1, '', 0, 0, now(), now())`, [status]);
  }

  it.each(["missing", "ready", "failed"])("creates one job and delivery task with one connection when the last build is %s", async status => {
    if (status !== "missing") await seedJob(status);
    const connect = vi.spyOn(pg.Client.prototype, "connect");
    const result = await rebuildPlog(env, 10, "owner");
    expect(connect).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, video_id: 10, status: "pending" });
    const { jobs, tasks } = await snapshot();
    expect(jobs).toHaveLength(status === "missing" ? 1 : 2);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ kind: "sqs_job", dedupe_key: `plog-build:${jobs.at(-1).id}` });
    expect(tasks[0].payload.message).toMatchObject({ type: "build_plog", payload: { video_id: 10 } });
    expect(processExternalTaskById).toHaveBeenCalledExactlyOnceWith(env, Number(tasks[0].id));
  });

  it.each(["pending", "running"])("reuses an existing %s job without writing or dispatching", async status => {
    await seedJob(status);
    const before = await snapshot();
    await expect(rebuildPlog(env, 10, "owner")).resolves.toMatchObject({ ok: true, job_id: 1, status });
    expect(await snapshot()).toEqual(before);
    expect(processExternalTaskById).not.toHaveBeenCalled();
  });

  it.each(["ready", "failed"])("reuses the conflicting job if the worker marks it %s before the lookup", async status => {
    await seedJob("running");
    const originalQuery = pg.Client.prototype.query;
    let finished = false;
    vi.spyOn(pg.Client.prototype, "query").mockImplementation(async function (this: pg.Client, ...args: Parameters<typeof originalQuery>) {
      const config = args[0];
      const text = typeof config === "string" ? config : config.text;
      if (this !== admin && !finished && text.startsWith("select ") && text.includes('from "plog_build_jobs"')) {
        finished = true;
        await admin.query("UPDATE plog_build_jobs SET status = $1, finished_at = now() WHERE id = 1", [status]);
      }
      return Reflect.apply(originalQuery, this, args);
    } as typeof originalQuery);

    await expect(rebuildPlog(env, 10, "owner")).resolves.toEqual({ ok: true, video_id: 10, job_id: 1, status });
    expect(finished).toBe(true);
    const { jobs, tasks } = await snapshot();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe(status);
    expect(tasks).toEqual([]);
    expect(processExternalTaskById).not.toHaveBeenCalled();
  });

  it.each([null, ""])("rejects an empty transcript (%s) without creating work", async transcript => {
    await admin.query("UPDATE videos SET transcript = $1 WHERE id = 10", [transcript]);
    await expect(rebuildPlog(env, 10, "owner")).resolves.toEqual({ notFound: "Transcript not found." });
    expect(await snapshot()).toEqual({ jobs: [], tasks: [] });
    expect(processExternalTaskById).not.toHaveBeenCalled();
  });

  it.each([20, 99])("does not reveal or create work for foreign or missing video %s", async videoId => {
    await expect(rebuildPlog(env, videoId, "owner")).resolves.toEqual({ notFound: "Video not found." });
    expect(await snapshot()).toEqual({ jobs: [], tasks: [] });
    expect(processExternalTaskById).not.toHaveBeenCalled();
  });

  it.each([" ", "Long transcript. ".repeat(10_000)])("checks presence without retrieving the transcript (case %#)", async transcript => {
    await admin.query("UPDATE videos SET transcript = $1 WHERE id = 10", [transcript]);
    const query = vi.spyOn(pg.Client.prototype, "query");
    await expect(rebuildPlog(env, 10, "owner")).resolves.toMatchObject({ ok: true });
    const index = query.mock.calls.findIndex(([q]) => (typeof q === "string" ? q : q.text).includes("COALESCE"));
    expect(index).toBeGreaterThanOrEqual(0);
    const response = await query.mock.results[index].value;
    expect(response.rows).toEqual([[true]]);
  });

  it.each(["delete", "clear", "transfer"])("rechecks the target after a concurrent %s while waiting for the lock", async change => {
    const writer = new pg.Client({ connectionString: databaseUrl });
    await writer.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await writer.query(`SET search_path TO "${schema}"`);
      await writer.query("BEGIN");
      await writer.query("SELECT 1 FROM videos WHERE id = 10 FOR UPDATE");
      pending = rebuildPlog(env, 10, "owner").catch(error => error);
      await vi.waitFor(async () => {
        expect((await admin.query("SELECT 1 FROM pg_stat_activity WHERE application_name = $1 AND cardinality(pg_blocking_pids(pid)) > 0", [schema])).rowCount).toBe(1);
      });
      await writer.query(change === "delete" ? "DELETE FROM videos WHERE id = 10"
        : change === "clear" ? "UPDATE videos SET transcript = '' WHERE id = 10"
          : "UPDATE videos SET user_id = 'other' WHERE id = 10");
      await writer.query("COMMIT");
      await expect(pending).resolves.toEqual({ notFound: change === "clear" ? "Transcript not found." : "Video not found." });
      expect(await snapshot()).toEqual({ jobs: [], tasks: [] });
      expect(processExternalTaskById).not.toHaveBeenCalled();
    } finally {
      await writer.query("ROLLBACK");
      await pending;
      await writer.end();
    }
  });

  it("creates and dispatches only one job for concurrent rebuild requests", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => rebuildPlog(env, 10, "owner")));
    expect(results).toEqual(Array(8).fill({ ok: true, video_id: 10, status: "pending", job_id: 1 }));
    const { jobs, tasks } = await snapshot();
    expect(jobs).toHaveLength(1);
    expect(tasks).toHaveLength(1);
    expect(processExternalTaskById).toHaveBeenCalledTimes(1);
  });

  it("rolls back the build job if persisting its delivery fails", async () => {
    await admin.query(`
      CREATE OR REPLACE FUNCTION reject_delivery() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'delivery rejected'; END;
      $$;
      CREATE TRIGGER reject_task BEFORE INSERT ON external_tasks FOR EACH ROW EXECUTE FUNCTION reject_delivery();
    `);
    await expect(rebuildPlog(env, 10, "owner")).rejects.toThrow();
    expect(await snapshot()).toEqual({ jobs: [], tasks: [] });
    expect(processExternalTaskById).not.toHaveBeenCalled();
  });
});
