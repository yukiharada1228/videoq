import { and, eq } from "drizzle-orm";
import { withDb } from "../db/pool";
import { appVideo, appVideogroup, appVideogroupmember } from "../db/schema";
import type { Bindings } from "../types/bindings";

/** path traversal 拒否（Django `_is_safe_path`）。 */
export function isSafeMediaPath(path: string): boolean {
  if (!path || path.startsWith("/") || path.includes("\\")) return false;
  const parts = path.split("/");
  return !parts.some((p) => p === ".." || p === "");
}

/** `app_video.file` 完全一致で video_id を返す。 */
export async function findVideoIdByFilePath(
  env: Bindings,
  path: string,
): Promise<number | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ id: appVideo.id })
      .from(appVideo)
      .where(eq(appVideo.file, path))
      .limit(1);
    return rows[0]?.id ?? null;
  });
}

export async function isVideoOwnedByUser(
  env: Bindings,
  videoId: number,
  userId: number,
): Promise<boolean> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ id: appVideo.id })
      .from(appVideo)
      .where(and(eq(appVideo.id, videoId), eq(appVideo.userId, userId)))
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
      .select({ id: appVideogroupmember.id })
      .from(appVideogroupmember)
      .where(
        and(
          eq(appVideogroupmember.videoId, videoId),
          eq(appVideogroupmember.groupId, groupId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  });
}

/** share_slug → group_id（ShareTokenAuthentication 相当）。 */
export async function resolveShareSlugGroupId(
  env: Bindings,
  shareSlug: string,
): Promise<number | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ id: appVideogroup.id })
      .from(appVideogroup)
      .where(eq(appVideogroup.shareSlug, shareSlug))
      .limit(1);
    return rows[0]?.id ?? null;
  });
}
