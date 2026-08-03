import { and, eq, sql } from "drizzle-orm";
import { withDb } from "../db/pool";
import { users } from "../db/schema";
import type { Bindings } from "../types/bindings";

/**
 * ストレージ使用量の会計（quota ドメイン）。動画削除後の best-effort 側効果。
 *   - RecordStorageUsageUseCase.execute(user, delta) → increment_storage_bytes
 *   - ClearOverQuotaIfWithinLimitUseCase.execute(user) → clear_over_quota_if_within_limit
 */

/**
 * AI 回答の上限チェック。LLM 呼び出し**前**に行う。
 *   - is_over_quota → overQuota（403 OVER_QUOTA）
 *   - ai_answers_limit が NULL → 無制限
 *   - used_ai_answers >= limit → exceeded（400 AI_ANSWERS_LIMIT_EXCEEDED）
 */
export async function checkAiAnswersLimit(
  env: Bindings,
  userId: number,
): Promise<{ ok: true } | { overQuota: true } | { exceeded: true; limit: number }> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({
        isOverQuota: users.isOverQuota,
        aiAnswersLimit: users.aiAnswersLimit,
        usedAiAnswers: users.usedAiAnswers,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const row = rows[0];
    if (row.isOverQuota) return { overQuota: true } as const;

    const limit = row.aiAnswersLimit;
    if (limit === null || limit === undefined) return { ok: true } as const;
    if (Number(row.usedAiAnswers) < Number(limit)) return { ok: true } as const;
    return { exceeded: true, limit: Number(limit) } as const;
  });
}

/**
 * AI 回答の利用量を回答**成功後**に best-effort で記録する。
 * maybe_reset_monthly_usage → increment_ai_answers の順で、月替わり（UTC の年/月比較）なら
 * used_processing_seconds / used_ai_answers を 0 にして usage_period_start を now に更新する。
 * 初回（usage_period_start IS NULL）も同じくリセット扱い。
 */
export async function recordAiAnswerUsage(env: Bindings, userId: number): Promise<void> {
  return withDb(env, async (db) => {
    await db
      .update(users)
      .set({
        usedProcessingSeconds: 0,
        usedAiAnswers: 0,
        usagePeriodStart: sql`now()`,
      })
      .where(
        and(
          eq(users.id, userId),
          sql`(
            ${users.usagePeriodStart} IS NULL
            OR date_trunc('month', ${users.usagePeriodStart} AT TIME ZONE 'UTC')
               <> date_trunc('month', now() AT TIME ZONE 'UTC')
          )`,
        ),
      );

    await db
      .update(users)
      .set({
        usedAiAnswers: sql`${users.usedAiAnswers} + 1`,
      })
      .where(eq(users.id, userId));
  });
}

/** 1 ファイルあたりの最大アップロードサイズ MB（get_max_upload_size_bytes の元値）。 */
export async function getMaxUploadSizeMb(
  env: Bindings,
  userId: number,
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
  userId: number,
  additionalBytes: number,
): Promise<{ ok: true } | { overQuota: true } | { exceeded: true; limit: number }> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({
        storageLimitGb: users.storageLimitGb,
        isOverQuota: users.isOverQuota,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const row = rows[0];
    if (row.isOverQuota) return { overQuota: true } as const;

    const gb = row.storageLimitGb;
    if (gb === null || gb === undefined) {
      await db
        .update(users)
        .set({
          usedStorageBytes: sql`${users.usedStorageBytes} + ${additionalBytes}`,
        })
        .where(eq(users.id, userId));
      return { ok: true } as const;
    }

    const limit = Math.floor(Number(gb) * 1073741824);
    const updated = await db
      .update(users)
      .set({
        usedStorageBytes: sql`${users.usedStorageBytes} + ${additionalBytes}`,
      })
      .where(
        and(
          eq(users.id, userId),
          sql`${users.usedStorageBytes} <= ${limit - additionalBytes}`,
        ),
      )
      .returning({ id: users.id });
    if (updated.length === 0) return { exceeded: true, limit } as const;
    return { ok: true } as const;
  });
}

/** used_storage_bytes を delta 分だけ増減（GREATEST(0, ...) で下限 0）。 */
export async function incrementStorageBytes(
  env: Bindings,
  userId: number,
  bytesDelta: number,
): Promise<void> {
  return withDb(env, async (db) => {
    await db
      .update(users)
      .set({
        usedStorageBytes: sql`GREATEST(0, ${users.usedStorageBytes} + ${bytesDelta})`,
      })
      .where(eq(users.id, userId));
  });
}

/**
 * is_over_quota を条件付きで解除。
 * over_quota かつ（無制限 or used <= storage_limit_gb*1024^3）なら false にする。
 * ストレージ上限 byte は floor で整数へ切り捨てる。
 */
export async function clearOverQuotaIfWithinLimit(
  env: Bindings,
  userId: number,
): Promise<void> {
  return withDb(env, async (db) => {
    await db
      .update(users)
      .set({ isOverQuota: false })
      .where(
        and(
          eq(users.id, userId),
          eq(users.isOverQuota, true),
          sql`(
            ${users.storageLimitGb} IS NULL
            OR ${users.usedStorageBytes} <= floor(${users.storageLimitGb} * 1073741824)
          )`,
        ),
      );
  });
}
