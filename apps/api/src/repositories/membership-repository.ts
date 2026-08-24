import { and, eq, inArray, sql } from "drizzle-orm";
import { withDb } from "../db/pool";
import { sqlNumberArray } from "../db/sql-array";
import {
  tags,
  videos,
  videoCourses,
  videoCourseMembers,
  videoTags,
} from "../db/schema";
import type { Bindings } from "../types/bindings";

/**
 * video↔tag / course↔video の関連付け書き込み（トランザクション適用）。
 * video/course の user_id による所有権判定を各書き込み前に行う。
 */

// ---- 所有確認 ----
export async function videoOwnedBy(
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

export async function courseOwnedBy(
  env: Bindings,
  courseId: number,
  userId: string,
): Promise<boolean> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ id: videoCourses.id })
      .from(videoCourses)
      .where(and(eq(videoCourses.id, courseId), eq(videoCourses.userId, userId)))
      .limit(1);
    return rows.length > 0;
  });
}

// =========================================================================
// video ↔ tag
// =========================================================================

/** 動画に現在ひも付くタグ id 一覧（plan_tag_attachment 用。動画は所有前提）。 */
export async function getAttachedTagIds(
  env: Bindings,
  videoId: number,
): Promise<number[]> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ tagId: videoTags.tagId })
      .from(videoTags)
      .where(eq(videoTags.videoId, videoId));
    return rows.map((row) => Number(row.tagId));
  });
}

/** user が所有する対象タグの件数（SomeTagsNotFound 判定用）。 */
export async function countOwnedTags(
  env: Bindings,
  tagIds: number[],
  userId: string,
): Promise<number> {
  if (tagIds.length === 0) return 0;
  return withDb(env, async (db) => {
    const rows = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(tags)
      .where(and(eq(tags.userId, userId), inArray(tags.id, tagIds)));
    return rows[0].c;
  });
}

/**
 * タグを動画へ付与（tx: 動画を FOR UPDATE → 既存を除外 → 一括 INSERT）。
 * ids_to_add は呼び出し側で dedupe + attached 除外済み前提。
 * 返り値は (added, skippedInPersist)。
 */
export async function attachTags(
  env: Bindings,
  videoId: number,
  idsToAdd: number[],
): Promise<{ added: number; skippedInPersist: number }> {
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM videos WHERE id = ${videoId} FOR UPDATE`);

      const existing = await tx
        .select({ tagId: videoTags.tagId })
        .from(videoTags)
        .where(
          and(eq(videoTags.videoId, videoId), inArray(videoTags.tagId, idsToAdd)),
        );
      const existingSet = new Set(existing.map((r) => Number(r.tagId)));
      const toAdd = idsToAdd.filter((id) => !existingSet.has(id));
      if (toAdd.length > 0) {
        await tx.execute(sql`
          INSERT INTO video_tags (video_id, tag_id, added_at)
          SELECT ${videoId}, t, CURRENT_TIMESTAMP FROM unnest(${sqlNumberArray(toAdd)}) AS t
        `);
      }
      return { added: toAdd.length, skippedInPersist: idsToAdd.length - toAdd.length };
    }),
  );
}

/** VideoTag(video_id, tag_id) の存在を確認する。 */
export async function videoTagExists(
  env: Bindings,
  videoId: number,
  tagId: number,
): Promise<boolean> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ id: videoTags.id })
      .from(videoTags)
      .where(and(eq(videoTags.videoId, videoId), eq(videoTags.tagId, tagId)))
      .limit(1);
    return rows.length > 0;
  });
}

/** タグを動画から剥がす（存在は呼び出し側で確認済み前提）。 */
export async function detachTag(
  env: Bindings,
  videoId: number,
  tagId: number,
): Promise<void> {
  return withDb(env, async (db) => {
    await db
      .delete(videoTags)
      .where(and(eq(videoTags.videoId, videoId), eq(videoTags.tagId, tagId)));
  });
}

// =========================================================================
// course ↔ video（単体）
// =========================================================================

/**
 * 動画 1 件を講座に追加（tx: course を FOR UPDATE → 既存なら alreadyIn →
 * order = MAX+1 で作成）。
 */
export async function addVideoToCourse(
  env: Bindings,
  courseId: number,
  videoId: number,
): Promise<{ alreadyIn: true } | { id: number }> {
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM video_courses WHERE id = ${courseId} FOR UPDATE`);

      const exists = await tx
        .select({ id: videoCourseMembers.id })
        .from(videoCourseMembers)
        .where(
          and(
            eq(videoCourseMembers.courseId, courseId),
            eq(videoCourseMembers.videoId, videoId),
          ),
        )
        .limit(1);
      if (exists.length > 0) {
        return { alreadyIn: true } as const;
      }

      const rows = await tx
        .insert(videoCourseMembers)
        .values({
          courseId,
          videoId,
          order: sql`(SELECT COALESCE(MAX("order"), -1) + 1 FROM video_course_members WHERE course_id = ${courseId})`,
          addedAt: sql`CURRENT_TIMESTAMP`,
        })
        .returning({ id: videoCourseMembers.id });
      return { id: Number(rows[0].id) } as const;
    }),
  );
}

/** 動画 1 件を講座から除去（tx: 非メンバーなら notMember）。 */
export async function removeVideoFromCourse(
  env: Bindings,
  courseId: number,
  videoId: number,
): Promise<{ notMember: true } | { ok: true }> {
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM video_courses WHERE id = ${courseId} FOR UPDATE`);
      const rows = await tx
        .delete(videoCourseMembers)
        .where(
          and(
            eq(videoCourseMembers.courseId, courseId),
            eq(videoCourseMembers.videoId, videoId),
          ),
        )
        .returning({ id: videoCourseMembers.id });
      return rows.length > 0 ? ({ ok: true } as const) : ({ notMember: true } as const);
    }),
  );
}

// =========================================================================
// course ↔ video（一括）
// =========================================================================

/** 講座の現メンバー video_id 一覧（plan_bulk_add 用）。 */
export async function getCourseMemberVideoIds(
  env: Bindings,
  courseId: number,
): Promise<number[]> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ videoId: videoCourseMembers.videoId })
      .from(videoCourseMembers)
      .where(eq(videoCourseMembers.courseId, courseId));
    return rows.map((row) => Number(row.videoId));
  });
}

/** user が所有する動画 id の集合。 */
export async function getExistingVideoIdsForUser(
  env: Bindings,
  videoIds: number[],
  userId: string,
): Promise<Set<number>> {
  if (videoIds.length === 0) return new Set();
  return withDb(env, async (db) => {
    const rows = await db
      .select({ id: videos.id })
      .from(videos)
      .where(and(inArray(videos.id, videoIds), eq(videos.userId, userId)));
    return new Set(rows.map((row) => Number(row.id)));
  });
}

/**
 * 動画を一括追加（tx: course を FOR UPDATE → Video 実在 & 未メンバーのみ →
 * order = base+idx で bulk INSERT）。返り値は added。
 */
export async function addVideosBulk(
  env: Bindings,
  courseId: number,
  idsToAdd: number[],
): Promise<number> {
  if (idsToAdd.length === 0) return 0;
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM video_courses WHERE id = ${courseId} FOR UPDATE`);

      const videosRes = await tx
        .select({ id: videos.id })
        .from(videos)
        .where(inArray(videos.id, idsToAdd));
      const videoSet = new Set(videosRes.map((r) => Number(r.id)));

      const memberRes = await tx
        .select({ videoId: videoCourseMembers.videoId })
        .from(videoCourseMembers)
        .where(
          and(
            eq(videoCourseMembers.courseId, courseId),
            inArray(videoCourseMembers.videoId, idsToAdd),
          ),
        );
      const memberSet = new Set(memberRes.map((r) => Number(r.videoId)));

      const videosToAdd = idsToAdd.filter((id) => videoSet.has(id) && !memberSet.has(id));
      if (videosToAdd.length === 0) return 0;

      await tx.execute(sql`
        INSERT INTO video_course_members (course_id, video_id, "order", added_at)
        SELECT ${courseId}, v.video_id,
               (SELECT COALESCE(MAX("order"), -1) FROM video_course_members WHERE course_id = ${courseId}) + v.ord,
               CURRENT_TIMESTAMP
          FROM unnest(${sqlNumberArray(videosToAdd)}) WITH ORDINALITY AS v(video_id, ord)
      `);
      return videosToAdd.length;
    }),
  );
}
