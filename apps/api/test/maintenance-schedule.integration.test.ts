import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  getNextMaintenanceWakeup,
  type MaintenanceWakeup,
  type MaintenanceWindows,
} from "../src/repositories/maintenance-schedule-repository";
import { chooseWakeup, nextIdleStrikes } from "../src/lib/task-scheduler";

const databaseUrl = process.env.QUOTA_TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;
type ScheduleEnv = Parameters<typeof getNextMaintenanceWakeup>[0];

const WINDOWS: MaintenanceWindows = {
  leaseMs: 5 * 60 * 1000,
  abandonedUploadMs: 2 * 60 * 60 * 1000,
  staleInvitationMs: 15 * 60 * 1000,
};

/** 起床時刻は now() 基準で決まるので、秒単位の誤差は許容する。 */
function expectAbout(actual: Date | null, expectedMs: number, toleranceMs = 5_000) {
  expect(actual).not.toBeNull();
  expect(Math.abs((actual as Date).getTime() - expectedMs)).toBeLessThan(toleranceMs);
}

function expectFutureWakeup(actual: MaintenanceWakeup, expectedMs: number) {
  expectAbout(actual.nextAt, expectedMs);
  expectAbout(actual.nextFutureAt, expectedMs);
}

describeWithPostgres("next maintenance wakeup on PostgreSQL", () => {
  const schemaName = `wakeup_${crypto.randomUUID().replaceAll("-", "")}`;
  const quotedSchema = `"${schemaName}"`;
  let admin: pg.Client;
  let env: ScheduleEnv;

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
      );
      CREATE TABLE ${quotedSchema}.videos (
        id bigserial PRIMARY KEY,
        status varchar(20) NOT NULL,
        uploaded_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE ${quotedSchema}.video_course_invitations (
        id bigserial PRIMARY KEY,
        status varchar(20) NOT NULL,
        delivery_status varchar(20) NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const scopedUrl = new URL(databaseUrl!);
    scopedUrl.searchParams.set("options", `-c search_path=${schemaName}`);
    env = { HYPERDRIVE: { connectionString: scopedUrl.toString() } } as ScheduleEnv;
  });

  afterEach(async () => {
    await admin.query(`
      TRUNCATE ${quotedSchema}.external_tasks,
               ${quotedSchema}.videos,
               ${quotedSchema}.video_course_invitations
    `);
  });

  afterAll(async () => {
    try {
      await admin.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
    } finally {
      await admin.end();
    }
  });

  it("回復対象が無ければ起床しない（DBが無音になる条件）", async () => {
    await expect(getNextMaintenanceWakeup(env, WINDOWS)).resolves.toEqual({
      nextAt: null,
      nextFutureAt: null,
    });
  });

  it("完了・deadのタスクは起床理由にならない", async () => {
    await admin.query(`
      INSERT INTO ${quotedSchema}.external_tasks (kind, payload, dedupe_key, completed_at, available_at)
      VALUES ('sqs_job', '{}', 'done', now(), now() + interval '1 minute');
      INSERT INTO ${quotedSchema}.external_tasks (kind, payload, dedupe_key, dead_at, available_at)
      VALUES ('sqs_job', '{}', 'dead', now(), now() + interval '2 minutes');
    `);

    await expect(getNextMaintenanceWakeup(env, WINDOWS)).resolves.toEqual({
      nextAt: null,
      nextFutureAt: null,
    });
  });

  it("バックオフ待ちのタスクをavailable_atちょうどで起こす", async () => {
    await admin.query(`
      INSERT INTO ${quotedSchema}.external_tasks (kind, payload, dedupe_key, available_at)
      VALUES ('sqs_job', '{}', 'backoff', now() + interval '10 minutes')
    `);

    expectFutureWakeup(
      await getNextMaintenanceWakeup(env, WINDOWS),
      Date.now() + 10 * 60_000,
    );
  });

  it("期限を過ぎたタスクは過去ではなく現在時刻を返す", async () => {
    await admin.query(`
      INSERT INTO ${quotedSchema}.external_tasks (kind, payload, dedupe_key, available_at)
      VALUES ('sqs_job', '{}', 'overdue', now() - interval '3 hours')
    `);

    const schedule = await getNextMaintenanceWakeup(env, WINDOWS);
    expectAbout(schedule.nextAt, Date.now());
    expect(schedule.nextFutureAt).toBeNull();
  });

  it("掴まれたままのタスクはリース満了時刻で起こす", async () => {
    await admin.query(`
      INSERT INTO ${quotedSchema}.external_tasks
        (kind, payload, dedupe_key, available_at, locked_at)
      VALUES ('sqs_job', '{}', 'leased', now() - interval '1 hour', now())
    `);

    expectFutureWakeup(await getNextMaintenanceWakeup(env, WINDOWS), Date.now() + WINDOWS.leaseMs);
  });

  it("リースが切れたタスクは即座に回収対象になる", async () => {
    await admin.query(`
      INSERT INTO ${quotedSchema}.external_tasks
        (kind, payload, dedupe_key, available_at, locked_at)
      VALUES ('sqs_job', '{}', 'expired', now() - interval '1 hour', now() - interval '6 minutes')
    `);

    const schedule = await getNextMaintenanceWakeup(env, WINDOWS);
    expectAbout(schedule.nextAt, Date.now());
    expect(schedule.nextFutureAt).toBeNull();
  });

  it("uploadingの行は放棄とみなす時刻で起こす", async () => {
    await admin.query(`
      INSERT INTO ${quotedSchema}.videos (status, uploaded_at)
      VALUES ('uploading', now() - interval '30 minutes'),
             ('completed', now() - interval '10 days')
    `);

    expectFutureWakeup(
      await getNextMaintenanceWakeup(env, WINDOWS),
      Date.now() + WINDOWS.abandonedUploadMs - 30 * 60_000,
    );
  });

  it("配送タスクが尽きた招待は猶予明けで起こす", async () => {
    await admin.query(`
      INSERT INTO ${quotedSchema}.video_course_invitations (status, delivery_status, updated_at)
      VALUES ('pending', 'queued', now() - interval '5 minutes')
    `);

    expectFutureWakeup(
      await getNextMaintenanceWakeup(env, WINDOWS),
      Date.now() + WINDOWS.staleInvitationMs - 5 * 60_000,
    );
  });

  it("生きた配送タスクがある招待では起床しない（空振りループを作らない）", async () => {
    const invitation = await admin.query<{ id: string }>(`
      INSERT INTO ${quotedSchema}.video_course_invitations (status, delivery_status, updated_at)
      VALUES ('pending', 'queued', now() - interval '1 hour')
      RETURNING id
    `);
    // 招待側が対象なら猶予はとうに過ぎており「今すぐ」になる。タスク側の
    // 一日後が返るなら、招待は正しく除外されている。
    await admin.query(
      `INSERT INTO ${quotedSchema}.external_tasks
         (kind, payload, dedupe_key, available_at)
       VALUES ('invitation_email', jsonb_build_object('invitation_id', $1::bigint),
               'live', now() + interval '1 day')`,
      [invitation.rows[0].id],
    );

    expectFutureWakeup(await getNextMaintenanceWakeup(env, WINDOWS), Date.now() + 86_400_000);
  });

  it("対象が複数あれば最も早い期限を返す", async () => {
    await admin.query(`
      INSERT INTO ${quotedSchema}.external_tasks (kind, payload, dedupe_key, available_at)
      VALUES ('sqs_job', '{}', 'later', now() + interval '90 minutes');
      INSERT INTO ${quotedSchema}.videos (status, uploaded_at)
      VALUES ('uploading', now() - interval '110 minutes');
      INSERT INTO ${quotedSchema}.video_course_invitations (status, delivery_status, updated_at)
      VALUES ('pending', 'queued', now());
    `);

    // タスク +90分 / 放棄アップロード uploaded_at+2h = +10分 / 招待 +15分。
    expectFutureWakeup(await getNextMaintenanceWakeup(env, WINDOWS), Date.now() + 10 * 60_000);
  });

  it("期限切れアップロードが残っても、別タスクのリース満了までに起こす", async () => {
    await admin.query(`
      INSERT INTO ${quotedSchema}.videos (status, uploaded_at)
      VALUES ('uploading', now() - interval '3 hours')
    `);
    const leased = await admin.query<{ expires_at: Date }>(`
      INSERT INTO ${quotedSchema}.external_tasks
        (kind, payload, dedupe_key, available_at, locked_at)
      VALUES ('sqs_job', '{}', 'in-flight', now() - interval '2 minutes', now() - interval '1 minute')
      RETURNING locked_at + interval '5 minutes' AS expires_at
    `);

    const schedule = await getNextMaintenanceWakeup(env, WINDOWS);
    const now = Date.now();
    const expiresAt = leased.rows[0].expires_at.getTime();
    expect(schedule.nextAt!.getTime()).toBeLessThan(now);
    expect(schedule.nextFutureAt?.getTime()).toBe(expiresAt);

    // 回収失敗が6回続いた状態で保険のアラームが発火した。リースが切れるまで
    // 配送を掴めなくても、次の起床を60分後へ遅らせてはいけない。
    const strikes = nextIdleStrikes({ progressed: false, overdue: true, previous: 6 });
    expect(
      chooseWakeup({
        nextAt: schedule.nextAt!.getTime(),
        nextFutureAt: schedule.nextFutureAt!.getTime(),
        pendingAlarm: null,
        strikes,
        now,
      }),
    ).toBe(expiresAt);
  });

  it.each(["external task", "upload", "invitation"] as const)(
    "同じ種類に期限切れと未来の対象があっても未来の期限を保持する: %s",
    async (kind) => {
      if (kind === "external task") {
        await admin.query(`
          INSERT INTO ${quotedSchema}.external_tasks (kind, payload, dedupe_key, available_at)
          VALUES ('sqs_job', '{}', 'overdue', now() - interval '1 hour'),
                 ('sqs_job', '{}', 'future', now() + interval '4 minutes')
        `);
      } else if (kind === "upload") {
        await admin.query(`
          INSERT INTO ${quotedSchema}.videos (status, uploaded_at)
          VALUES ('uploading', now() - interval '3 hours'),
                 ('uploading', now() - interval '116 minutes')
        `);
      } else {
        await admin.query(`
          INSERT INTO ${quotedSchema}.video_course_invitations (status, delivery_status, updated_at)
          VALUES ('pending', 'queued', now() - interval '1 hour'),
                 ('pending', 'queued', now() - interval '11 minutes')
        `);
      }

      const schedule = await getNextMaintenanceWakeup(env, WINDOWS);
      const now = Date.now();
      expect(schedule.nextAt!.getTime()).toBeLessThanOrEqual(now);
      expectAbout(schedule.nextFutureAt, now + 4 * 60_000);
      expect(
        chooseWakeup({
          nextAt: schedule.nextAt!.getTime(),
          nextFutureAt: schedule.nextFutureAt!.getTime(),
          pendingAlarm: null,
          strikes: 7,
          now,
        }),
      ).toBe(schedule.nextFutureAt!.getTime());
    },
  );
});
