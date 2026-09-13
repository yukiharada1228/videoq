import { withDb } from "../db/pool";
import type { Bindings } from "../types/bindings";

/**
 * 回復処理が次に起きるべき時刻。ポーリングを止めた代わりに、
 * 「いつ起きれば取りこぼさないか」を DB から一度だけ引く。
 */
export type MaintenanceWindows = {
  /** claimExternalTasks のリース満了までの猶予。DB 側の INTERVAL と一致させる。 */
  leaseMs: number;
  /** uploading のまま放置された行を放棄とみなすまでの時間。 */
  abandonedUploadMs: number;
  /** queued のまま配送タスクが尽きた招待を failed に倒すまでの猶予。 */
  staleInvitationMs: number;
};

/**
 * 次に回復処理を走らせるべき時刻。対象が何も無ければ null。
 *
 * 三種類の回復対象それぞれの「最も早い期限」を LEAST でまとめる
 * （LEAST は NULL を無視し、全て NULL のときだけ NULL を返す）。
 * 各副問い合わせの述語は、実際に回復を行う側の述語と一致させること。
 * ここだけ緩いと、回復できない行を延々と起こし続ける空振りループになる。
 */
export async function getNextMaintenanceWakeup(
  env: Bindings,
  windows: MaintenanceWindows,
): Promise<Date | null> {
  return withDb(env, async (_db, client) => {
    const result = await client.query<{ next_at: string | null }>(
      `SELECT LEAST(
         (SELECT MIN(
                   CASE
                     WHEN task.locked_at IS NOT NULL
                      AND task.locked_at > now() - make_interval(secs => $1::double precision)
                       THEN task.locked_at + make_interval(secs => $1::double precision)
                     ELSE GREATEST(task.available_at, now())
                   END
                 )
            FROM external_tasks AS task
           WHERE task.completed_at IS NULL
             AND task.dead_at IS NULL),
         (SELECT MIN(video.uploaded_at) + make_interval(secs => $2::double precision)
            FROM videos AS video
           WHERE video.status = 'uploading'),
         (SELECT MIN(invitation.updated_at) + make_interval(secs => $3::double precision)
            FROM video_course_invitations AS invitation
           WHERE invitation.status = 'pending'
             AND invitation.delivery_status = 'queued'
             AND NOT EXISTS (
                   SELECT 1
                     FROM external_tasks AS live
                    WHERE live.kind = 'invitation_email'
                      AND live.completed_at IS NULL
                      AND live.dead_at IS NULL
                      AND (live.payload->>'invitation_id')::bigint = invitation.id
                 ))
       ) AS next_at`,
      [
        windows.leaseMs / 1000,
        windows.abandonedUploadMs / 1000,
        windows.staleInvitationMs / 1000,
      ],
    );
    const nextAt = result.rows[0]?.next_at ?? null;
    return nextAt === null ? null : new Date(nextAt);
  });
}
