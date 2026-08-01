import { withClient } from "../db/pool";
import { APP_TIMEZONE, normalizeDrfDatetime } from "../utils/datetime";
import type { Bindings } from "../types/bindings";

/** Django VideoGroupListSerializer に一致する形。 */
export type GroupListItem = {
  id: number;
  name: string;
  description: string;
  display_order: number;
  created_at: string;
  video_count: number;
};

/**
 * ユーザーのグループ一覧（ページ）+ 総数を単一接続で取得。
 * 並び: display_order ASC, created_at DESC, id ASC（QueryOptimizer と一致）。
 * video_count = 所属動画の distinct 件数（Count("members__video", distinct=True) 相当）。
 */
export async function listGroupsPage(
  env: Bindings,
  userId: number,
  limit: number,
  offset: number,
): Promise<{ count: number; results: GroupListItem[] }> {
  return withClient(env, async (client) => {
    // DRF は settings.TIME_ZONE で datetime を表現するため、セッション tz を合わせる。
    await client.query(`SET timezone = '${APP_TIMEZONE}'`);

    const countRes = await client.query(
      `SELECT count(*)::int AS c FROM app_videogroup WHERE user_id = $1`,
      [userId],
    );

    const { rows } = await client.query(
      `SELECT g.id, g.name, g.description, g.display_order,
              to_char(g.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF') AS created_at,
              (SELECT count(DISTINCT m.video_id)
                 FROM app_videogroupmember m
                WHERE m.group_id = g.id)::int AS video_count
         FROM app_videogroup g
        WHERE g.user_id = $1
        ORDER BY g.display_order ASC, g.created_at DESC, g.id ASC
        LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );

    const results: GroupListItem[] = rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      description: r.description,
      display_order: r.display_order,
      created_at: normalizeDrfDatetime(r.created_at),
      video_count: r.video_count,
    }));
    return { count: countRes.rows[0].c, results };
  });
}
