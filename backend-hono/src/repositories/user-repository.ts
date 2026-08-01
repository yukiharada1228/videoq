import { withClient } from "../db/pool";
import type { Bindings } from "../types/bindings";

/**
 * `/api/auth/me` の契約（Django UserSerializer / CurrentUserOutput）に一致する形。
 * 派生値の計算式は現行 domain（quota entities）と一致させる:
 *   storage_limit_bytes = storage_limit_gb === null ? null : trunc(gb * 1024^3)
 *   processing_limit_seconds = processing_limit_minutes === null ? null : minutes * 60
 */
export type CurrentUser = {
  id: number;
  username: string;
  email: string;
  video_count: number;
  max_video_upload_size_mb: number;
  used_storage_bytes: number;
  storage_limit_bytes: number | null;
  used_processing_seconds: number;
  processing_limit_seconds: number | null;
  used_ai_answers: number;
  ai_answers_limit: number | null;
  is_over_quota: boolean;
};

const GIB = 1024 ** 3;

export async function getCurrentUser(
  env: Bindings,
  userId: number,
): Promise<CurrentUser | null> {
  return withClient(env, async (client) => {
    const { rows } = await client.query(
      `SELECT u.id, u.username, u.email,
              u.max_video_upload_size_mb,
              u.used_storage_bytes, u.storage_limit_gb,
              u.used_processing_seconds, u.processing_limit_minutes,
              u.used_ai_answers, u.ai_answers_limit, u.is_over_quota,
              (SELECT count(*) FROM app_video v WHERE v.user_id = u.id)::int AS video_count
       FROM app_user u
       WHERE u.id = $1`,
      [userId],
    );
    if (rows.length === 0) return null;
    const r = rows[0];

    const storageLimitGb =
      r.storage_limit_gb === null ? null : Number(r.storage_limit_gb);
    const processingLimitMinutes =
      r.processing_limit_minutes === null ? null : Number(r.processing_limit_minutes);

    return {
      // pg は bigint を文字列で返すため Number 化（Django は int を返す）
      id: Number(r.id),
      username: r.username,
      email: r.email,
      video_count: r.video_count,
      max_video_upload_size_mb: r.max_video_upload_size_mb,
      used_storage_bytes: Number(r.used_storage_bytes),
      storage_limit_bytes:
        storageLimitGb === null ? null : Math.trunc(storageLimitGb * GIB),
      used_processing_seconds: r.used_processing_seconds,
      processing_limit_seconds:
        processingLimitMinutes === null ? null : processingLimitMinutes * 60,
      used_ai_answers: r.used_ai_answers,
      ai_answers_limit: r.ai_answers_limit === null ? null : Number(r.ai_answers_limit),
      is_over_quota: r.is_over_quota,
    };
  });
}
