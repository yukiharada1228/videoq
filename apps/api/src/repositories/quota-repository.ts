import { and, eq, sql } from "drizzle-orm";
import { type Db, withClient } from "../db/pool";
import { users } from "../db/schema";
import type { Bindings } from "../types/bindings";

export type AiAnswerReservation = {
  userId: string;
  /** DB の精度を失わず返却条件に使うため、PostgreSQL の timestamptz 文字列表現を保持する。 */
  usagePeriodStart: string;
};

export type AiAnswerReservationResult =
  | { reservation: AiAnswerReservation }
  | { overQuota: true }
  | { exceeded: true; limit: number };

export type StorageReservationResult =
  | { ok: true }
  | { overQuota: true }
  | { exceeded: true; limit: number };

export type UploadReservationResult =
  | { ok: true; periodStart: string }
  | { overQuota: true }
  | { exceeded: true; limit: number }
  | { monthlyUploadExceeded: true; limit: number };

// Independent of the AI/transcription period: resetting either quota must never
// erase upload usage. The database clock decides the month, including under load.
export const uploadUsageIsCurrent = sql`date_trunc('month', ${users.uploadUsagePeriodStart}, 'UTC')
  = date_trunc('month', CURRENT_TIMESTAMP, 'UTC')`;
export const currentUploadBytes = sql<number>`CASE WHEN ${uploadUsageIsCurrent}
  THEN ${users.usedUploadBytes} ELSE 0 END`;

/** Reserve both allowances in one conditional write, in the video's transaction. */
export async function reserveUploadInTransaction(
  db: Pick<Db, "update" | "select">,
  userId: string,
  additionalBytes: number,
): Promise<UploadReservationResult> {
  if (!Number.isSafeInteger(additionalBytes) || additionalBytes <= 0) {
    throw new Error("Upload reservation bytes must be a positive safe integer.");
  }
  // The caller already holds the owner lock. Capture one fresh clock value
  // after that lock: transaction_timestamp() may still be in the previous month
  // after waiting, and must not overwrite usage already booked in the new one.
  const [clock] = await db.select({
    periodStart: sql<string>`date_trunc('month', clock_timestamp(), 'UTC')::text`,
  }).from(users).where(eq(users.id, userId));
  if (!clock) throw new Error("Quota owner not found.");
  const usage = sql`CASE WHEN ${users.uploadUsagePeriodStart} = ${clock.periodStart}::timestamptz
    THEN ${users.usedUploadBytes} ELSE 0 END`;
  const [reserved] = await db.update(users).set({
    usedStorageBytes: sql`${users.usedStorageBytes} + ${additionalBytes}`,
    usedUploadBytes: sql`${usage} + ${additionalBytes}`,
    uploadUsagePeriodStart: clock.periodStart,
  }).where(and(
    eq(users.id, userId),
    sql`${users.isOverQuota} IS NOT TRUE`,
    sql`(${users.storageLimitGb} IS NULL OR ${users.usedStorageBytes}
      <= floor(${users.storageLimitGb} * 1073741824) - ${additionalBytes})`,
    sql`(${users.monthlyUploadLimitGb} IS NULL OR ${usage}
      <= floor(${users.monthlyUploadLimitGb} * 1073741824) - ${additionalBytes})`,
  )).returning({ periodStart: users.uploadUsagePeriodStart });
  if (reserved?.periodStart) return { ok: true, periodStart: reserved.periodStart };

  const [state] = await db.select({
    overQuota: users.isOverQuota,
    storageLimit: users.storageLimitGb,
    storageUsed: users.usedStorageBytes,
    monthlyLimit: users.monthlyUploadLimitGb,
  }).from(users).where(eq(users.id, userId));
  if (!state) throw new Error("Quota owner not found.");
  if (state.overQuota) return { overQuota: true };
  if (state.storageLimit !== null &&
      state.storageUsed > Math.floor(state.storageLimit * 1073741824) - additionalBytes) {
    return { exceeded: true, limit: Math.floor(state.storageLimit * 1073741824) };
  }
  if (state.monthlyLimit !== null) {
    return { monthlyUploadExceeded: true, limit: Math.floor(state.monthlyLimit * 1073741824) };
  }
  throw new Error("Failed to reserve unlimited upload quota.");
}

/** Only call while deleting the locked, still-unconfirmed video in the same transaction. */
export async function refundUnconfirmedUpload(
  db: Pick<Db, "update">, userId: string, bytes: number, periodStart: string,
): Promise<void> {
  await db.update(users).set({
    usedUploadBytes: sql`GREATEST(0, ${users.usedUploadBytes} - ${bytes})`,
  }).where(and(eq(users.id, userId), eq(users.uploadUsagePeriodStart, periodStart)));
}

const MONTHLY_USAGE_IS_STALE_SQL = `(
  usage_period_start IS NULL
  OR date_trunc('month', usage_period_start, 'UTC')
     <> date_trunc('month', now(), 'UTC')
)`;

const RESERVE_AI_ANSWER_SQL = `UPDATE users
   SET used_ai_answers = CASE
         WHEN ${MONTHLY_USAGE_IS_STALE_SQL} THEN 1
         ELSE used_ai_answers + 1
       END,
       used_processing_seconds = CASE
         WHEN ${MONTHLY_USAGE_IS_STALE_SQL} THEN 0
         ELSE used_processing_seconds
       END,
       usage_period_start = CASE
         WHEN ${MONTHLY_USAGE_IS_STALE_SQL} THEN now()
         ELSE usage_period_start
       END
 WHERE id = $1
   AND is_over_quota IS NOT TRUE
   AND (
     ai_answers_limit IS NULL
     OR CASE
          WHEN ${MONTHLY_USAGE_IS_STALE_SQL} THEN 0
          ELSE used_ai_answers
        END < ai_answers_limit
   )
 RETURNING usage_period_start::text AS usage_period_start`;

/**
 * LLM 呼び出し前に AI 回答枠を予約する。
 *
 * 上限判定・UTC 月替わりリセット・加算を単一の条件付き UPDATE にまとめることで、
 * 同じ所有者に対する並行リクエストでも上限を超えて予約されないようにする。
 */
export async function reserveAiAnswerUsage(
  env: Bindings,
  userId: string,
): Promise<AiAnswerReservationResult> {
  return withClient(env, async (client) => {
    const reserved = await client.query<{ usage_period_start: string }>(
      RESERVE_AI_ANSWER_SQL,
      [userId],
    );

    const reservation = reserved.rows[0];
    if (reservation) {
      return {
        reservation: {
          userId,
          usagePeriodStart: reservation.usage_period_start,
        },
      };
    }

    const state = await client.query<{
      is_over_quota: boolean;
      ai_answers_limit: number | null;
    }>(
      `SELECT is_over_quota, ai_answers_limit
         FROM users
        WHERE id = $1`,
      [userId],
    );
    const row = state.rows[0];
    if (!row) throw new Error("Quota owner not found.");
    if (row.is_over_quota) return { overQuota: true } as const;

    const limit = row.ai_answers_limit;
    if (limit === null) {
      throw new Error("Failed to reserve an unlimited AI answer quota.");
    }
    return { exceeded: true, limit: Number(limit) } as const;
  });
}

/**
 * 回答を利用者へ完了できなかった場合に予約を返却する。
 * 月替わり後の新しい利用期間を誤って減算しないよう、予約時の期間も条件に含める。
 */
export async function releaseAiAnswerReservation(
  env: Bindings,
  reservation: AiAnswerReservation,
): Promise<void> {
  return withClient(env, async (client) => {
    await client.query(
      `UPDATE users
          SET used_ai_answers = GREATEST(used_ai_answers - 1, 0)
        WHERE id = $1
          AND usage_period_start = $2::timestamptz`,
      [reservation.userId, reservation.usagePeriodStart],
    );
  });
}

/** 動画行などと同じtransactionへ容量予約を含めるための共通primitive。 */
export async function reserveStorageInTransaction(
  db: Pick<Db, "update" | "select">,
  userId: string,
  additionalBytes: number,
): Promise<StorageReservationResult> {
  if (!Number.isSafeInteger(additionalBytes) || additionalBytes < 0) {
    throw new Error("Storage reservation bytes must be a non-negative safe integer.");
  }
  const reserved = await db
    .update(users)
    .set({
      usedStorageBytes: sql`${users.usedStorageBytes} + ${additionalBytes}`,
    })
    .where(
      and(
        eq(users.id, userId),
        sql`${users.isOverQuota} IS NOT TRUE`,
        sql`(
          ${users.storageLimitGb} IS NULL
          OR ${users.usedStorageBytes}
             <= floor(${users.storageLimitGb} * 1073741824) - ${additionalBytes}
        )`,
      ),
    )
    .returning({ id: users.id });
  if (reserved.length > 0) return { ok: true } as const;

  const state = await db
    .select({
      isOverQuota: users.isOverQuota,
      limitBytes: sql<number | null>`CASE
        WHEN ${users.storageLimitGb} IS NULL THEN NULL
        ELSE floor(${users.storageLimitGb} * 1073741824)::bigint
      END`,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const row = state[0];
  if (!row) throw new Error("Quota owner not found.");
  if (row.isOverQuota) return { overQuota: true } as const;
  if (row.limitBytes === null) {
    throw new Error("Failed to reserve unlimited storage quota.");
  }
  return { exceeded: true, limit: Number(row.limitBytes) } as const;
}
