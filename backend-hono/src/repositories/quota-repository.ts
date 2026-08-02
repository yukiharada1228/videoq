import { withDb } from "../db/pool";
import type { Bindings } from "../types/bindings";

/**
 * ストレージ使用量の会計（quota ドメイン）。動画削除後の best-effort 側効果。
 *   - RecordStorageUsageUseCase.execute(user, delta) → increment_storage_bytes
 *   - ClearOverQuotaIfWithinLimitUseCase.execute(user) → clear_over_quota_if_within_limit
 */

/**
 * AI 回答の上限チェック（CheckAiAnswersLimitUseCase 相当）。LLM 呼び出し**前**に行う。
 *   - is_over_quota → overQuota（403 OVER_QUOTA）
 *   - ai_answers_limit が NULL → 無制限
 *   - used_ai_answers >= limit → exceeded（400 AI_ANSWERS_LIMIT_EXCEEDED）
 */
export async function checkAiAnswersLimit(
  env: Bindings,
  userId: number,
): Promise<{ ok: true } | { overQuota: true } | { exceeded: true; limit: number }> {
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT is_over_quota, ai_answers_limit, used_ai_answers
         FROM app_user WHERE id = $1`,
      [userId],
    );
    const row = rows[0];
    if (row.is_over_quota) return { overQuota: true } as const;

    const limit = row.ai_answers_limit;
    if (limit === null || limit === undefined) return { ok: true } as const;
    if (Number(row.used_ai_answers) < Number(limit)) return { ok: true } as const;
    return { exceeded: true, limit: Number(limit) } as const;
  });
}

/**
 * AI 回答の利用量記録（RecordAiAnswerUsageUseCase 相当）。回答**成功後**に行う best-effort。
 * maybe_reset_monthly_usage → increment_ai_answers の順で、月替わり（UTC の年/月比較）なら
 * used_processing_seconds / used_ai_answers を 0 にして usage_period_start を now に更新する。
 * 初回（usage_period_start IS NULL）も同じくリセット扱い。
 */
export async function recordAiAnswerUsage(env: Bindings, userId: number): Promise<void> {
  return withDb(env, async (db, client) => {
    await client.query(
      `UPDATE app_user
          SET used_processing_seconds = 0,
              used_ai_answers = 0,
              usage_period_start = now()
        WHERE id = $1
          AND (
            usage_period_start IS NULL
            OR date_trunc('month', usage_period_start AT TIME ZONE 'UTC')
               <> date_trunc('month', now() AT TIME ZONE 'UTC')
          )`,
      [userId],
    );
    await client.query(
      `UPDATE app_user SET used_ai_answers = used_ai_answers + 1 WHERE id = $1`,
      [userId],
    );
  });
}

/** 1 ファイルあたりの最大アップロードサイズ MB（get_max_upload_size_bytes の元値）。 */
export async function getMaxUploadSizeMb(
  env: Bindings,
  userId: number,
): Promise<number> {
  return withDb(env, async (db, client) => {
    const r = await client.query(
      `SELECT max_video_upload_size_mb FROM app_user WHERE id = $1`,
      [userId],
    );
    return Number(r.rows[0].max_video_upload_size_mb);
  });
}

/**
 * ストレージの確認＋予約（check_and_reserve_storage 相当）。
 * over_quota → overQuota。無制限 → 無条件加算。制限あり → 条件付き原子 UPDATE
 * （used <= limit - additional なら加算）。加算不可なら exceeded(limit)。
 * limit = int(storage_limit_gb * 1024^3)。
 */
export async function checkAndReserveStorage(
  env: Bindings,
  userId: number,
  additionalBytes: number,
): Promise<{ ok: true } | { overQuota: true } | { exceeded: true; limit: number }> {
  return withDb(env, async (db, client) => {
    const u = await client.query(
      `SELECT storage_limit_gb, is_over_quota FROM app_user WHERE id = $1`,
      [userId],
    );
    const row = u.rows[0];
    if (row.is_over_quota) return { overQuota: true } as const;

    const gb = row.storage_limit_gb;
    if (gb === null || gb === undefined) {
      await client.query(
        `UPDATE app_user SET used_storage_bytes = used_storage_bytes + $2 WHERE id = $1`,
        [userId, additionalBytes],
      );
      return { ok: true } as const;
    }

    const limit = Math.floor(Number(gb) * 1073741824);
    const res = await client.query(
      `UPDATE app_user SET used_storage_bytes = used_storage_bytes + $2
        WHERE id = $1 AND used_storage_bytes <= $3`,
      [userId, additionalBytes, limit - additionalBytes],
    );
    if (res.rowCount === 0) return { exceeded: true, limit } as const;
    return { ok: true } as const;
  });
}

/** used_storage_bytes を delta 分だけ増減（GREATEST(0, ...) で下限 0）。 */
export async function incrementStorageBytes(
  env: Bindings,
  userId: number,
  bytesDelta: number,
): Promise<void> {
  return withDb(env, async (db, client) => {
    await client.query(
      `UPDATE app_user
          SET used_storage_bytes = GREATEST(0, used_storage_bytes + $2)
        WHERE id = $1`,
      [userId, bytesDelta],
    );
  });
}

/**
 * is_over_quota を条件付きで解除。
 * over_quota かつ（無制限 or used <= storage_limit_gb*1024^3）なら false にする。
 * get_storage_limit_bytes は int() 切り捨てのため floor で一致させる。
 */
export async function clearOverQuotaIfWithinLimit(
  env: Bindings,
  userId: number,
): Promise<void> {
  return withDb(env, async (db, client) => {
    await client.query(
      `UPDATE app_user
          SET is_over_quota = false
        WHERE id = $1
          AND is_over_quota = true
          AND (
            storage_limit_gb IS NULL
            OR used_storage_bytes <= floor(storage_limit_gb * 1073741824)
          )`,
      [userId],
    );
  });
}
