import { withDb } from "../db/pool";
import type { Bindings } from "../types/bindings";

/** path traversal 拒否（Django `_is_safe_path`）。 */
export function isSafeMediaPath(path: string): boolean {
  if (!path || path.startsWith("/") || path.includes("\\")) return false;
  const parts = path.split("/");
  return !parts.some((p) => p === ".." || p === "");
}

/**
 * `app_video.file` 完全一致で video_id を返す。
 * （schema 経由の query builder も可だが、テスト/既存 SQL 契約を維持するため client.query）
 */
export async function findVideoIdByFilePath(
  env: Bindings,
  path: string,
): Promise<number | null> {
  return withDb(env, async (_db, client) => {
    const { rows } = await client.query(
      `SELECT id FROM app_video WHERE file = $1 LIMIT 1`,
      [path],
    );
    return rows.length ? Number(rows[0].id) : null;
  });
}

export async function isVideoOwnedByUser(
  env: Bindings,
  videoId: number,
  userId: number,
): Promise<boolean> {
  return withDb(env, async (_db, client) => {
    const { rows } = await client.query(
      `SELECT 1 FROM app_video WHERE id = $1 AND user_id = $2 LIMIT 1`,
      [videoId, userId],
    );
    return rows.length > 0;
  });
}

export async function isVideoInGroup(
  env: Bindings,
  videoId: number,
  groupId: number,
): Promise<boolean> {
  return withDb(env, async (_db, client) => {
    const { rows } = await client.query(
      `SELECT 1 FROM app_videogroupmember
        WHERE video_id = $1 AND group_id = $2 LIMIT 1`,
      [videoId, groupId],
    );
    return rows.length > 0;
  });
}

/** share_slug → group_id（ShareTokenAuthentication 相当）。 */
export async function resolveShareSlugGroupId(
  env: Bindings,
  shareSlug: string,
): Promise<number | null> {
  return withDb(env, async (_db, client) => {
    const { rows } = await client.query(
      `SELECT id FROM app_videogroup WHERE share_slug = $1 LIMIT 1`,
      [shareSlug],
    );
    return rows.length ? Number(rows[0].id) : null;
  });
}
