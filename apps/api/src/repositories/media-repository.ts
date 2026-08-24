import { and, eq, or, sql } from "drizzle-orm";
import { withDb } from "../db/pool";
import {
  videos,
  videoCourses,
  videoCourseMembers,
  videoCourseMemberships,
} from "../db/schema";
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

export async function isVideoAccessibleToUser(
  env: Bindings,
  videoId: number,
  userId: string,
): Promise<boolean> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ id: videos.id })
      .from(videos)
      .where(
        and(
          eq(videos.id, videoId),
          or(
            eq(videos.userId, userId),
            sql`EXISTS (
              SELECT 1
                FROM ${videoCourseMembers}
                JOIN ${videoCourseMemberships}
                  ON ${videoCourseMemberships.courseId} = ${videoCourseMembers.courseId}
               WHERE ${videoCourseMembers.videoId} = ${videos.id}
                 AND ${videoCourseMemberships.userId} = ${userId}
            )`,
          ),
        ),
      )
      .limit(1);
    return rows.length > 0;
  });
}

export async function isVideoInCourse(
  env: Bindings,
  videoId: number,
  courseId: number,
): Promise<boolean> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ id: videoCourseMembers.id })
      .from(videoCourseMembers)
      .where(
        and(
          eq(videoCourseMembers.videoId, videoId),
          eq(videoCourseMembers.courseId, courseId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  });
}

/** share_slug から course_id を解決する。 */
export async function resolveShareSlugCourseId(
  env: Bindings,
  shareSlug: string,
): Promise<number | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ id: videoCourses.id })
      .from(videoCourses)
      .where(eq(videoCourses.shareSlug, shareSlug))
      .limit(1);
    return rows[0]?.id ?? null;
  });
}
