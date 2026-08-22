import { and, eq, sql } from "drizzle-orm";
import { type Db, withDb } from "../db/pool";
import { externalTasks, users } from "../db/schema";
import type { JobMessage } from "../lib/job-message";
import type { Bindings } from "../types/bindings";

export type ExternalTaskKind =
  | "sqs_job"
  | "storage_cleanup"
  | "invitation_email";

export type ClaimedExternalTask = {
  id: number;
  kind: ExternalTaskKind;
  payload: Record<string, unknown>;
};

export type PersistedExternalTask = {
  id: number;
  created: boolean;
};

export const MAX_EXTERNAL_TASK_ATTEMPTS = 48;

export type ExternalTaskHealth = {
  pending: number;
  dead: number;
  oldestPendingSeconds: number | null;
};

/** 呼び出し元のDB transactionにジョブ配送も含めるためのoutbox primitive。 */
export async function insertJobTask(
  db: Pick<Db, "insert" | "select">,
  params: { message: JobMessage; dedupeKey?: string },
): Promise<PersistedExternalTask> {
  const dedupeKey = params.dedupeKey ?? `job:${params.message.job_id}`;
  const inserted = await db
    .insert(externalTasks)
    .values({
      kind: "sqs_job",
      payload: { message: params.message },
      dedupeKey,
    })
    .onConflictDoNothing()
    .returning({ id: externalTasks.id });
  if (inserted.length > 0) {
    return { id: Number(inserted[0].id), created: true };
  }
  const existing = await db
    .select({ id: externalTasks.id })
    .from(externalTasks)
    .where(eq(externalTasks.dedupeKey, dedupeKey))
    .limit(1);
  if (existing.length === 0) throw new Error("External job task disappeared.");
  return { id: Number(existing[0].id), created: false };
}

export async function createJobTask(
  env: Bindings,
  params: { message: JobMessage; dedupeKey?: string },
): Promise<PersistedExternalTask> {
  return withDb(env, (db) => insertJobTask(db, params));
}

export async function claimExternalTasks(
  env: Bindings,
  params: { limit: number; taskId?: number },
): Promise<ClaimedExternalTask[]> {
  return withDb(env, async (_db, client) => {
    const result = await client.query<{
      id: string;
      kind: ExternalTaskKind;
      payload: Record<string, unknown>;
    }>(
      `WITH candidates AS (
           SELECT id
             FROM external_tasks
            WHERE completed_at IS NULL
              AND dead_at IS NULL
            AND available_at <= now()
            AND (locked_at IS NULL OR locked_at < now() - INTERVAL '5 minutes')
            AND ($2::bigint IS NULL OR id = $2)
          ORDER BY available_at, id
          FOR UPDATE SKIP LOCKED
          LIMIT $1
       )
       UPDATE external_tasks AS task
          SET locked_at = now(),
              attempts = attempts + 1,
              updated_at = now()
         FROM candidates
        WHERE task.id = candidates.id
      RETURNING task.id, task.kind, task.payload`,
      [params.limit, params.taskId ?? null],
    );
    return result.rows.map((row) => ({
      id: Number(row.id),
      kind: row.kind,
      payload: row.payload,
    }));
  });
}

export async function completeExternalTask(
  env: Bindings,
  taskId: number,
): Promise<void> {
  await withDb(env, async (db) => {
    await db
      .update(externalTasks)
      .set({
        completedAt: sql`now()`,
        lockedAt: null,
        lastError: "",
        updatedAt: sql`now()`,
      })
      .where(and(eq(externalTasks.id, taskId), sql`${externalTasks.completedAt} IS NULL`));
  });
}

/** R2削除後の容量返却とタスク完了を、同じDBトランザクションで一度だけ行う。 */
export async function completeStorageCleanupTask(
  env: Bindings,
  params: { taskId: number; userId: string; bytes: number | null },
): Promise<void> {
  await withDb(env, async (db) =>
    db.transaction(async (tx) => {
      const tasks = await tx
        .select({
          completedAt: externalTasks.completedAt,
          effectAppliedAt: externalTasks.effectAppliedAt,
        })
        .from(externalTasks)
        .where(eq(externalTasks.id, params.taskId))
        .for("update")
        .limit(1);
      const task = tasks[0];
      if (!task || task.completedAt !== null) return;

      if (task.effectAppliedAt === null && params.bytes !== null && params.bytes > 0) {
        const remaining = sql`GREATEST(0, ${users.usedStorageBytes} - ${params.bytes})`;
        await tx
          .update(users)
          .set({
            usedStorageBytes: remaining,
            isOverQuota: sql`CASE
              WHEN ${users.isOverQuota}
               AND (
                 ${users.storageLimitGb} IS NULL
                 OR ${remaining} <= floor(${users.storageLimitGb} * 1073741824)
               )
              THEN false
              ELSE ${users.isOverQuota}
            END`,
          })
          .where(eq(users.id, params.userId));
      }

      await tx
        .update(externalTasks)
        .set({
          effectAppliedAt: task.effectAppliedAt ?? sql`now()`,
          completedAt: sql`now()`,
          lockedAt: null,
          lastError: "",
          updatedAt: sql`now()`,
        })
        .where(eq(externalTasks.id, params.taskId));
    }),
  );
}

export async function failExternalTask(
  env: Bindings,
  taskId: number,
  error: string,
): Promise<{ dead: boolean }> {
  return withDb(env, async (_db, client) => {
    const result = await client.query<{ dead: boolean }>(
      `UPDATE external_tasks
          SET locked_at = NULL,
              last_error = $2,
              dead_at = CASE WHEN attempts >= $3 THEN now() ELSE NULL END,
              available_at = CASE
                WHEN attempts >= $3 THEN available_at
                ELSE now()
                  + LEAST(3600, 5 * (2 ^ LEAST(attempts, 10))) * INTERVAL '1 second'
              END,
              updated_at = now()
        WHERE id = $1 AND completed_at IS NULL
    RETURNING dead_at IS NOT NULL AS dead`,
      [taskId, error.slice(0, 2000), MAX_EXTERNAL_TASK_ATTEMPTS],
    );
    return { dead: result.rows[0]?.dead === true };
  });
}

/** Workers Logs向けの小さなbacklog snapshot。監視系を業務処理へ混ぜない。 */
export async function getExternalTaskHealth(env: Bindings): Promise<ExternalTaskHealth> {
  return withDb(env, async (_db, client) => {
    const result = await client.query<{
      pending: string;
      dead: string;
      oldest_pending_seconds: string | null;
    }>(
      `SELECT COUNT(*) FILTER (
                WHERE completed_at IS NULL AND dead_at IS NULL
              )::text AS pending,
              COUNT(*) FILTER (WHERE dead_at IS NOT NULL)::text AS dead,
              EXTRACT(EPOCH FROM now() - MIN(created_at) FILTER (
                WHERE completed_at IS NULL AND dead_at IS NULL
              ))::text AS oldest_pending_seconds
         FROM external_tasks`,
    );
    const row = result.rows[0];
    return {
      pending: Number(row?.pending ?? 0),
      dead: Number(row?.dead ?? 0),
      oldestPendingSeconds:
        row?.oldest_pending_seconds == null
          ? null
          : Number(row.oldest_pending_seconds),
    };
  });
}

/** SQS最大保持期間より長い30日を過ぎた完了台帳だけを、小分けで削除する。 */
export async function pruneDeliveryHistory(
  env: Bindings,
  retentionDays = 30,
  limit = 500,
): Promise<{ externalTasks: number; jobExecutions: number }> {
  if (!Number.isSafeInteger(retentionDays) || retentionDays < 1) {
    throw new Error("retentionDays must be a positive integer.");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 5000) {
    throw new Error("limit must be an integer between 1 and 5000.");
  }
  return withDb(env, async (_db, client) => {
    const external = await client.query(
      `WITH victims AS (
         SELECT id
           FROM external_tasks
          WHERE completed_at < now() - ($1 * INTERVAL '1 day')
          ORDER BY completed_at, id
          LIMIT $2
       )
       DELETE FROM external_tasks AS task
        USING victims
        WHERE task.id = victims.id
    RETURNING task.id`,
      [retentionDays, limit],
    );
    const jobs = await client.query(
      `WITH victims AS (
         SELECT candidate.job_id
           FROM job_executions AS candidate
          WHERE candidate.completed_at < now() - ($1 * INTERVAL '1 day')
            AND NOT EXISTS (
                  SELECT 1
                    FROM external_tasks AS task
                   WHERE task.kind = 'sqs_job'
                     AND task.completed_at IS NULL
                     AND task.payload->'message'->>'job_id' = candidate.job_id
                )
          ORDER BY candidate.completed_at, candidate.job_id
          LIMIT $2
       )
       DELETE FROM job_executions AS job
        USING victims
        WHERE job.job_id = victims.job_id
    RETURNING job.job_id`,
      [retentionDays, limit],
    );
    return {
      externalTasks: external.rowCount ?? 0,
      jobExecutions: jobs.rowCount ?? 0,
    };
  });
}

/** 動画削除トランザクション内でcleanup taskを作るための小さな共通関数。 */
export async function insertStorageCleanupTask(
  db: Pick<Db, "insert" | "select">,
  params: {
    dedupeKey: string;
    userId: string;
    fileKey: string;
    bytes: number | null;
  },
): Promise<number> {
  const rows = await db
    .insert(externalTasks)
    .values({
      kind: "storage_cleanup",
      payload: {
        user_id: params.userId,
        file_key: params.fileKey,
        bytes: params.bytes,
      },
      dedupeKey: params.dedupeKey,
    })
    .onConflictDoNothing()
    .returning({ id: externalTasks.id });
  if (rows.length > 0) return Number(rows[0].id);
  const existing = await db
    .select({ id: externalTasks.id })
    .from(externalTasks)
    .where(eq(externalTasks.dedupeKey, params.dedupeKey))
    .limit(1);
  if (existing.length === 0) throw new Error("Storage cleanup task disappeared.");
  return Number(existing[0].id);
}
