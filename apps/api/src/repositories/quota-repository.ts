import { and, eq, sql } from "drizzle-orm";
import { type Db, withDb } from "../db/pool";
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
  return withDb(env, async (_db, client) => {
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
  return withDb(env, async (_db, client) => {
    await client.query(
      `UPDATE users
          SET used_ai_answers = GREATEST(used_ai_answers - 1, 0)
        WHERE id = $1
          AND usage_period_start = $2::timestamptz`,
      [reservation.userId, reservation.usagePeriodStart],
    );
  });
}

/** 1 ファイルあたりの最大アップロードサイズ MB（get_max_upload_size_bytes の元値）。 */
export async function getMaxUploadSizeMb(
  env: Bindings,
  userId: string,
): Promise<number> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ maxVideoUploadSizeMb: users.maxVideoUploadSizeMb })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return Number(rows[0].maxVideoUploadSizeMb);
  });
}

/**
 * ストレージ容量を確認して予約する。
 * over_quota → overQuota。無制限 → 無条件加算。制限あり → 条件付き原子 UPDATE
 * （used <= limit - additional なら加算）。加算不可なら exceeded(limit)。
 * limit = int(storage_limit_gb * 1024^3)。
 */
export async function checkAndReserveStorage(
  env: Bindings,
  userId: string,
  additionalBytes: number,
): Promise<StorageReservationResult> {
  if (!Number.isSafeInteger(additionalBytes) || additionalBytes < 0) {
    throw new Error("Storage reservation bytes must be a non-negative safe integer.");
  }
  return withDb(env, async (db) =>
    db.transaction((tx) => reserveStorageInTransaction(tx, userId, additionalBytes)),
  );
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
