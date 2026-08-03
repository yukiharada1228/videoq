import { and, eq, inArray, sql } from "drizzle-orm";
import { withDb } from "../db/pool";
import { sqlNumberArray } from "../db/sql-array";
import {
  tags,
  videos,
  videoGroups,
  videoGroupMembers,
  videoTags,
} from "../db/schema";
import type { Bindings } from "../types/bindings";

/**
 * video↔tag / group↔video の関連付け書き込み（トランザクション適用）。
 * video/group の user_id による所有権判定を各書き込み前に行う。
 */

// ---- 所有確認 ----
export async function videoOwnedBy(
  env: Bindings,
  videoId: number,
  userId: number,
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

export async function groupOwnedBy(
  env: Bindings,
  groupId: number,
  userId: number,
): Promise<boolean> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ id: videoGroups.id })
      .from(videoGroups)
      .where(and(eq(videoGroups.id, groupId), eq(videoGroups.userId, userId)))
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
  userId: number,
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
// group ↔ video（単体）
// =========================================================================

/**
 * 動画 1 件をグループに追加（tx: group を FOR UPDATE → 既存なら alreadyIn →
 * order = MAX+1 で作成）。
 */
export async function addVideoToGroup(
  env: Bindings,
  groupId: number,
  videoId: number,
): Promise<{ alreadyIn: true } | { id: number }> {
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM video_groups WHERE id = ${groupId} FOR UPDATE`);

      const exists = await tx
        .select({ id: videoGroupMembers.id })
        .from(videoGroupMembers)
        .where(
          and(
            eq(videoGroupMembers.groupId, groupId),
            eq(videoGroupMembers.videoId, videoId),
          ),
        )
        .limit(1);
      if (exists.length > 0) {
        return { alreadyIn: true } as const;
      }

      const rows = await tx
        .insert(videoGroupMembers)
        .values({
          groupId,
          videoId,
          order: sql`(SELECT COALESCE(MAX("order"), -1) + 1 FROM video_group_members WHERE group_id = ${groupId})`,
          addedAt: sql`CURRENT_TIMESTAMP`,
        })
        .returning({ id: videoGroupMembers.id });
      return { id: Number(rows[0].id) } as const;
    }),
  );
}

/** 動画 1 件をグループから除去（tx: 非メンバーなら notMember）。 */
export async function removeVideoFromGroup(
  env: Bindings,
  groupId: number,
  videoId: number,
): Promise<{ notMember: true } | { ok: true }> {
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM video_groups WHERE id = ${groupId} FOR UPDATE`);
      const rows = await tx
        .delete(videoGroupMembers)
        .where(
          and(
            eq(videoGroupMembers.groupId, groupId),
            eq(videoGroupMembers.videoId, videoId),
          ),
        )
        .returning({ id: videoGroupMembers.id });
      return rows.length > 0 ? ({ ok: true } as const) : ({ notMember: true } as const);
    }),
  );
}

// =========================================================================
// group ↔ video（一括）
// =========================================================================

/** グループの現メンバー video_id 一覧（plan_bulk_add 用）。 */
export async function getGroupMemberVideoIds(
  env: Bindings,
  groupId: number,
): Promise<number[]> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ videoId: videoGroupMembers.videoId })
      .from(videoGroupMembers)
      .where(eq(videoGroupMembers.groupId, groupId));
    return rows.map((row) => Number(row.videoId));
  });
}

/** user が所有する動画 id の集合。 */
export async function getExistingVideoIdsForUser(
  env: Bindings,
  videoIds: number[],
  userId: number,
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
 * 動画を一括追加（tx: group を FOR UPDATE → Video 実在 & 未メンバーのみ →
 * order = base+idx で bulk INSERT）。返り値は added。
 */
export async function addVideosBulk(
  env: Bindings,
  groupId: number,
  idsToAdd: number[],
): Promise<number> {
  if (idsToAdd.length === 0) return 0;
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM video_groups WHERE id = ${groupId} FOR UPDATE`);

      const videosRes = await tx
        .select({ id: videos.id })
        .from(videos)
        .where(inArray(videos.id, idsToAdd));
      const videoSet = new Set(videosRes.map((r) => Number(r.id)));

      const memberRes = await tx
        .select({ videoId: videoGroupMembers.videoId })
        .from(videoGroupMembers)
        .where(
          and(
            eq(videoGroupMembers.groupId, groupId),
            inArray(videoGroupMembers.videoId, idsToAdd),
          ),
        );
      const memberSet = new Set(memberRes.map((r) => Number(r.videoId)));

      const videosToAdd = idsToAdd.filter((id) => videoSet.has(id) && !memberSet.has(id));
      if (videosToAdd.length === 0) return 0;

      await tx.execute(sql`
        INSERT INTO video_group_members (group_id, video_id, "order", added_at)
        SELECT ${groupId}, v.video_id,
               (SELECT COALESCE(MAX("order"), -1) FROM video_group_members WHERE group_id = ${groupId}) + v.ord,
               CURRENT_TIMESTAMP
          FROM unnest(${sqlNumberArray(videosToAdd)}) WITH ORDINALITY AS v(video_id, ord)
      `);
      return videosToAdd.length;
    }),
  );
}
