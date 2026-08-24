import { and, asc, desc, eq, or, type SQL, sql } from "drizzle-orm";
import { withDb } from "../db/pool";
import { sqlNumberArray } from "../db/sql-array";
import {
  chatLogs,
  chatLogEvaluations,
  videos,
  videoCourses,
  videoCourseMembers,
  videoCourseMemberships,
} from "../db/schema";
import { toUtcIso } from "../shared/datetime";
import { mapVideoListRow, type VideoListItem } from "./video-repository";
import type { Bindings } from "../types/bindings";

/** VideoCourse 一覧 API のレスポンス表現。 */
export type CourseListItem = {
  id: number;
  name: string;
  description: string;
  display_order: number;
  created_at: string;
  video_count: number;
  access_role: "owner" | "member";
};

/**
 * ユーザーの講座一覧（ページ）+ 総数を単一接続で取得。
 * 並び: display_order ASC, created_at DESC, id ASC。
 * video_count は所属する動画の重複を除いた件数。
 */
// VideoCourseDetailSerializer: 一覧 + updated_at / share_slug / videos（ネスト）
export type CourseDetail = {
  id: number;
  name: string;
  description: string;
  display_order: number;
  created_at: string;
  updated_at: string;
  video_count: number;
  share_slug: string | null;
  videos: (VideoListItem & { order: number })[];
  access_role: "owner" | "member" | "public";
};

// Must be "video_courses"."id": ${videoCourses.id} becomes bare "id" → m.id.
const courseVideoCount = sql<number>`(SELECT count(DISTINCT m.video_id)::int FROM video_course_members m WHERE m.course_id = "video_courses"."id")`.as(
  "video_count",
);
// Outer table must be qualified — ${videos.id} becomes bare "id" (ambiguous vs t.id).
const videoTagsJson = sql<string>`COALESCE((
  SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color) ORDER BY t.name)
  FROM video_tags vt JOIN tags t ON t.id = vt.tag_id
  WHERE vt.video_id = "videos"."id"
), '[]'::json)::text`.as("tags");

/**
 * 指定 WHERE 条件で講座詳細を1件取得（VideoCourseDetailSerializer 形）。
 * 未一致は null。videos は各メンバーの動画一覧表現 + order。
 */
async function fetchCourseDetail(
  env: Bindings,
  where: SQL,
  accessRole: "public" | { viewerUserId: string },
): Promise<CourseDetail | null> {
  const data = await withDb(env, async (db) => {
    const courseRows = await db
      .select({
        id: videoCourses.id,
        name: videoCourses.name,
        description: videoCourses.description,
        display_order: videoCourses.displayOrder,
        created_at: videoCourses.createdAt,
        updated_at: videoCourses.updatedAt,
        share_slug: videoCourses.shareSlug,
        video_count: courseVideoCount,
        owner_user_id: videoCourses.userId,
      })
      .from(videoCourses)
      .where(where)
      .limit(1);
    if (courseRows.length === 0) return null;
    const courseId = Number(courseRows[0].id);

    const memberRows = await db
      .select({
        member_order: videoCourseMembers.order,
        id: videos.id,
        file: videos.file,
        title: videos.title,
        description: videos.description,
        uploaded_at: videos.uploadedAt,
        status: videos.status,
        source_type: videos.sourceType,
        source_url: videos.sourceUrl,
        youtube_video_id: videos.youtubeVideoId,
        tags: videoTagsJson,
      })
      .from(videoCourseMembers)
      .innerJoin(videos, eq(videos.id, videoCourseMembers.videoId))
      .where(eq(videoCourseMembers.courseId, courseId))
      .orderBy(asc(videoCourseMembers.order), asc(videoCourseMembers.addedAt));

    return { course: courseRows[0], members: memberRows };
  });

  if (!data) return null;

  const nestedVideos = await Promise.all(
    data.members.map(async (r) => ({
      ...(await mapVideoListRow(env, r)),
      order: r.member_order,
    })),
  );

  const g = data.course;
  return {
    id: Number(g.id),
    name: g.name,
    description: g.description,
    display_order: g.display_order,
    created_at: toUtcIso(g.created_at)!,
    updated_at: toUtcIso(g.updated_at)!,
    video_count: g.video_count,
    share_slug: g.share_slug ?? null,
    videos: nestedVideos,
    access_role:
      accessRole === "public"
        ? "public"
        : g.owner_user_id === accessRole.viewerUserId
          ? "owner"
          : "member",
  };
}

/**
 * VideoCourseDetailView: id + user_id で1件取得（未所有/不在は null）。
 * videos は各メンバーの VideoListSerializer 出力 + order（メンバー順 order, added_at）。
 */
export function getCourseDetail(
  env: Bindings,
  courseId: number,
  userId: string,
): Promise<CourseDetail | null> {
  return fetchCourseDetail(
    env,
    and(
      eq(videoCourses.id, courseId),
      or(
        eq(videoCourses.userId, userId),
        sql`EXISTS (
          SELECT 1 FROM ${videoCourseMemberships}
           WHERE ${videoCourseMemberships.courseId} = ${videoCourses.id}
             AND ${videoCourseMemberships.userId} = ${userId}
        )`,
      ),
    )!,
    { viewerUserId: userId },
  );
}

/**
 * share_slug で1件取得する（認証不要・完全一致）。未一致は null。
 * 出力は VideoCourseDetailSerializer（getCourseDetail と同形）。
 */
export function getCourseDetailByShareSlug(
  env: Bindings,
  shareSlug: string,
): Promise<CourseDetail | null> {
  return fetchCourseDetail(env, eq(videoCourses.shareSlug, shareSlug), "public");
}

/** 講座作成（display_order = MAX+1 を単一 INSERT で原子採番）。作成した id を返す。 */
export async function createCourse(
  env: Bindings,
  userId: string,
  name: string,
  description: string,
): Promise<number> {
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM users WHERE id = ${userId} FOR UPDATE`);
      const rows = await tx
        .insert(videoCourses)
        .values({
          userId,
          name,
          description,
          displayOrder: sql`(SELECT COALESCE(MAX(display_order), -1) + 1 FROM video_courses WHERE user_id = ${userId})`,
          createdAt: sql`CURRENT_TIMESTAMP`,
          updatedAt: sql`CURRENT_TIMESTAMP`,
          shareSlug: null,
        })
        .returning({ id: videoCourses.id });
      return Number(rows[0].id);
    }),
  );
}

/** 講座更新（提供フィールドのみ動的 SET。updated_at は更新しない）。 */
export async function updateCourse(
  env: Bindings,
  courseId: number,
  userId: string,
  fields: { name?: string; description?: string },
): Promise<{ notFound: true } | { ok: true }> {
  return withDb(env, async (db) => {
    const owner = await db
      .select({ id: videoCourses.id })
      .from(videoCourses)
      .where(and(eq(videoCourses.id, courseId), eq(videoCourses.userId, userId)))
      .limit(1);
    if (owner.length === 0) return { notFound: true } as const;

    const patch: { name?: string; description?: string } = {};
    if (fields.name !== undefined) patch.name = fields.name;
    if (fields.description !== undefined) patch.description = fields.description;
    if (Object.keys(patch).length > 0) {
      await db
        .update(videoCourses)
        .set(patch)
        .where(and(eq(videoCourses.id, courseId), eq(videoCourses.userId, userId)));
    }
    return { ok: true } as const;
  });
}

/** 講座削除（所有権を先に確認し、tx で cascade 削除）。 */
export async function deleteCourse(
  env: Bindings,
  courseId: number,
  userId: string,
): Promise<{ notFound: true } | { ok: true }> {
  return withDb(env, async (db) => {
    return db.transaction(async (tx) => {
      const owner = await tx
        .select({ id: videoCourses.id })
        .from(videoCourses)
        .where(and(eq(videoCourses.id, courseId), eq(videoCourses.userId, userId)))
        .for("update");
      if (owner.length === 0) return { notFound: true } as const;

      await tx.execute(sql`
        DELETE FROM chat_log_evaluations
         WHERE chat_log_id IN (SELECT id FROM chat_logs WHERE course_id = ${courseId})
      `);
      await tx.delete(chatLogs).where(eq(chatLogs.courseId, courseId));
      await tx.delete(videoCourseMembers).where(eq(videoCourseMembers.courseId, courseId));
      await tx
        .delete(videoCourses)
        .where(and(eq(videoCourses.id, courseId), eq(videoCourses.userId, userId)));
      return { ok: true } as const;
    });
  });
}

/**
 * 講座表示順を並び替える。
 * 空/重複 → mismatch。選択講座の既存 display_order 値集合を
 * ソート順のまま course_ids の並びへ再割り当て（値集合は保存）。
 */
export async function reorderCourses(
  env: Bindings,
  userId: string,
  courseIds: number[],
): Promise<{ mismatch: true } | { ok: true }> {
  if (courseIds.length === 0) return { mismatch: true } as const;
  if (new Set(courseIds).size !== courseIds.length) return { mismatch: true } as const;

  return withDb(env, async (db) => {
    return db.transaction(async (tx) => {
      const sel = await tx.execute(sql`
        SELECT id, display_order FROM video_courses
         WHERE user_id = ${userId} AND id = ANY(${sqlNumberArray(courseIds)})
         ORDER BY display_order ASC, created_at DESC, id ASC
         FOR UPDATE
      `);
      const rows = sel.rows as Array<{ id: number; display_order: number }>;
      if (rows.length !== courseIds.length) return { mismatch: true } as const;
      const slots = rows.map((r) => r.display_order);
      await tx.execute(sql`
        UPDATE video_courses AS g SET display_order = d.slot
          FROM unnest(${sqlNumberArray(courseIds)}, ${sqlNumberArray(slots, "int")}) AS d(gid, slot)
         WHERE g.id = d.gid AND g.user_id = ${userId}
      `);
      return { ok: true } as const;
    });
  });
}

/**
 * 講座内動画を並び替える。order = 0 始まりの連番。
 * 呼び出し側で「メンバー集合と一致」を検証済み前提。
 */
export async function reorderVideos(
  env: Bindings,
  courseId: number,
  videoIds: number[],
): Promise<void> {
  return withDb(env, async (db) => {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM video_courses WHERE id = ${courseId} FOR UPDATE`);
      if (videoIds.length > 0) {
        await tx.execute(sql`
          UPDATE video_course_members AS m SET "order" = v.ord - 1
            FROM unnest(${sqlNumberArray(videoIds)}) WITH ORDINALITY AS v(video_id, ord)
           WHERE m.course_id = ${courseId} AND m.video_id = v.video_id
        `);
      }
    });
  });
}

/** 講座の現在の share_slug（講座不在/未所有は found:false）。 */
export async function getCourseShareSlug(
  env: Bindings,
  courseId: number,
  userId: string,
): Promise<{ found: false } | { found: true; slug: string | null }> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ share_slug: videoCourses.shareSlug })
      .from(videoCourses)
      .where(and(eq(videoCourses.id, courseId), eq(videoCourses.userId, userId)))
      .limit(1);
    if (rows.length === 0) return { found: false } as const;
    return { found: true, slug: rows[0].share_slug ?? null };
  });
}

/**
 * share_slug を設定または解除する。CI unique 違反(23505)は conflict。
 * slug=null で解除。
 */
export async function setShareSlug(
  env: Bindings,
  courseId: number,
  userId: string,
  slug: string | null,
): Promise<{ conflict: true } | { ok: true }> {
  return withDb(env, async (db) => {
    try {
      await db
        .update(videoCourses)
        .set({ shareSlug: slug })
        .where(and(eq(videoCourses.id, courseId), eq(videoCourses.userId, userId)));
      return { ok: true } as const;
    } catch (e) {
      if ((e as { code?: string }).code === "23505") return { conflict: true } as const;
      throw e;
    }
  });
}

export async function listCoursesPage(
  env: Bindings,
  userId: string,
  limit: number,
  offset: number,
): Promise<{ count: number; results: CourseListItem[] }> {
  return withDb(env, async (db) => {
    const countRows = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(videoCourses)
      .where(
        or(
          eq(videoCourses.userId, userId),
          sql`EXISTS (
            SELECT 1 FROM ${videoCourseMemberships}
             WHERE ${videoCourseMemberships.courseId} = ${videoCourses.id}
               AND ${videoCourseMemberships.userId} = ${userId}
          )`,
        ),
      );

    const rows = await db
      .select({
        id: videoCourses.id,
        name: videoCourses.name,
        description: videoCourses.description,
        display_order: videoCourses.displayOrder,
        created_at: videoCourses.createdAt,
        video_count: courseVideoCount,
        access_role: sql<"owner" | "member">`CASE
          WHEN ${videoCourses.userId} = ${userId} THEN 'owner'
          ELSE 'member'
        END`,
      })
      .from(videoCourses)
      .where(
        or(
          eq(videoCourses.userId, userId),
          sql`EXISTS (
            SELECT 1 FROM ${videoCourseMemberships}
             WHERE ${videoCourseMemberships.courseId} = ${videoCourses.id}
               AND ${videoCourseMemberships.userId} = ${userId}
          )`,
        ),
      )
      .orderBy(
        sql`CASE WHEN ${videoCourses.userId} = ${userId} THEN 0 ELSE 1 END`,
        asc(videoCourses.displayOrder),
        desc(videoCourses.createdAt),
        asc(videoCourses.id),
      )
      .limit(limit)
      .offset(offset);

    const results: CourseListItem[] = rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      description: r.description,
      display_order: r.display_order,
      created_at: toUtcIso(r.created_at)!,
      video_count: r.video_count,
      access_role: r.access_role,
    }));
    return { count: countRows[0].c, results };
  });
}
