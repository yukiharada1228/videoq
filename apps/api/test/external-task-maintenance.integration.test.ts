import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  claimExternalTasks,
  failExternalTask,
  getExternalTaskHealth,
  pruneDeliveryHistory,
} from "../src/repositories/external-task-repository";

const databaseUrl = process.env.QUOTA_TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;
type TaskEnv = Parameters<typeof claimExternalTasks>[0];

describeWithPostgres("external task maintenance on PostgreSQL", () => {
  const schemaName = `external_tasks_${crypto.randomUUID().replaceAll("-", "")}`;
  const quotedSchema = `"${schemaName}"`;
  let admin: pg.Client;
  let env: TaskEnv;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: databaseUrl });
    await admin.connect();
    await admin.query(`CREATE SCHEMA ${quotedSchema}`);
    await admin.query(`
      CREATE TABLE ${quotedSchema}.external_tasks (
        id bigserial PRIMARY KEY,
        kind varchar(32) NOT NULL,
        payload jsonb NOT NULL,
        dedupe_key varchar(255) NOT NULL UNIQUE,
        attempts integer NOT NULL DEFAULT 0,
        available_at timestamptz NOT NULL DEFAULT now(),
        locked_at timestamptz,
        completed_at timestamptz,
        dead_at timestamptz,
        effect_applied_at timestamptz,
        last_error text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await admin.query(`
      CREATE TABLE ${quotedSchema}.job_executions (
        job_id varchar(128) PRIMARY KEY,
        completed_at timestamptz
      )
    `);
    const scopedUrl = new URL(databaseUrl!);
    scopedUrl.searchParams.set("options", `-c search_path=${schemaName}`);
    env = { HYPERDRIVE: { connectionString: scopedUrl.toString() } } as TaskEnv;
  });

  afterAll(async () => {
    try {
      await admin.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
    } finally {
      await admin.end();
    }
  });

  it("同じtaskを並列claimしても一つだけが所有する", async () => {
    const inserted = await admin.query<{ id: string }>(`
      INSERT INTO ${quotedSchema}.external_tasks (kind, payload, dedupe_key)
      VALUES ('sqs_job', '{"message": {}}', 'parallel')
      RETURNING id
    `);
    const taskId = Number(inserted.rows[0].id);
    const claims = await Promise.all(
      Array.from({ length: 10 }, () =>
        claimExternalTasks(env, { limit: 1, taskId }),
      ),
    );

    expect(claims.flat()).toHaveLength(1);
  });

  it("48回失敗したtaskをdeadにして通常claimから除外する", async () => {
    const inserted = await admin.query<{ id: string }>(`
      INSERT INTO ${quotedSchema}.external_tasks
        (kind, payload, dedupe_key, attempts, locked_at)
      VALUES ('sqs_job', '{"message": {}}', 'dead', 48, now())
      RETURNING id
    `);
    const taskId = Number(inserted.rows[0].id);

    await expect(failExternalTask(env, taskId, "poison")).resolves.toEqual({
      dead: true,
    });
    await expect(claimExternalTasks(env, { limit: 1, taskId })).resolves.toEqual([]);
    await expect(getExternalTaskHealth(env)).resolves.toMatchObject({ dead: 1 });
  });

  it("30日を超えた完了履歴だけを削除する", async () => {
    await admin.query(`
      INSERT INTO ${quotedSchema}.external_tasks
        (kind, payload, dedupe_key, completed_at)
      VALUES ('sqs_job', '{}', 'old-completed', now() - interval '31 days'),
             ('sqs_job', '{}', 'recent-completed', now())
    `);
    await admin.query(`
      INSERT INTO ${quotedSchema}.job_executions (job_id, completed_at)
      VALUES ('old-job', now() - interval '31 days'),
             ('recent-job', now()),
             ('referenced-job', now() - interval '31 days')
    `);
    await admin.query(`
      INSERT INTO ${quotedSchema}.external_tasks
        (kind, payload, dedupe_key, dead_at)
      VALUES (
        'sqs_job',
        '{"message": {"job_id": "referenced-job"}}',
        'dead-with-ledger',
        now()
      )
    `);

    await expect(pruneDeliveryHistory(env)).resolves.toEqual({
      externalTasks: 1,
      jobExecutions: 1,
    });
    const referenced = await admin.query(`
      SELECT 1
        FROM ${quotedSchema}.job_executions
       WHERE job_id = 'referenced-job'
    `);
    expect(referenced.rowCount).toBe(1);
  });
});
