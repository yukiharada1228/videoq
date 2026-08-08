import { and, eq } from "drizzle-orm";
import { withDb } from "../db/pool";
import { videos, videoGroups, videoGroupMembers } from "../db/schema";
import type { Bindings } from "../types/bindings";

/** path traversal を拒否する。 */
export function isSafeMediaPath(path: string): boolean {
  if (!path || path.startsWith("/") || path.includes("\\")) return false;
  const parts = path.split("/");
  return !parts.some((p) => p === ".." || p === "");
}

/** `videos.file` 完全一致で video_id を返す。 */
export async function findVideoIdByFilePath(
  env: Bindings,
  path: string,
): Promise<number | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ id: videos.id })
      .from(videos)
      .where(eq(videos.file, path))
      .limit(1);
    return rows[0]?.id ?? null;
  });
}

export async function isVideoOwnedByUser(
  env: Bindings,
  videoId: number,
  userId: string,
): Promise<boolean> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ id: videos.id })
      .from(videos)
      .where(and(eq(videos.id, videoId), eq(videos.userId, userId)))
      .limit(1);
    return rows.length > 0;
  });
}

export async function isVideoInGroup(
  env: Bindings,
  videoId: number,
  groupId: number,
): Promise<boolean> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ id: videoGroupMembers.id })
      .from(videoGroupMembers)
      .where(
        and(
          eq(videoGroupMembers.videoId, videoId),
          eq(videoGroupMembers.groupId, groupId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  });
}

/** share_slug から group_id を解決する。 */
export async function resolveShareSlugGroupId(
  env: Bindings,
  shareSlug: string,
): Promise<number | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ id: videoGroups.id })
      .from(videoGroups)
      .where(eq(videoGroups.shareSlug, shareSlug))
      .limit(1);
    return rows[0]?.id ?? null;
  });
}
