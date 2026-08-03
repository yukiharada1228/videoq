import { and, eq, inArray, sql } from "drizzle-orm";
import { withDb } from "../db/pool";
import {
  appTag,
  appVideo,
  appVideogroup,
  appVideogroupmember,
  appVideotag,
} from "../db/schema";
import type { Bindings } from "../types/bindings";

/**
 * video↔tag / group↔video の関連付け書き込み（トランザクション適用）。
 * Django の manage_tags / manage_groups UseCase + DjangoTagRepository/
 * DjangoVideoGroupRepository と契約互換。所有権判定（video/group の user_id）は
 * 各 UseCase が get_by_id(…, user_id) で行うのを踏襲する。
 */

// ---- 所有確認（get_by_id(…, user_id) 相当）----
export async function videoOwnedBy(
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

export async function groupOwnedBy(
  env: Bindings,
  groupId: number,
  userId: number,
): Promise<boolean> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ id: appVideogroup.id })
      .from(appVideogroup)
      .where(and(eq(appVideogroup.id, groupId), eq(appVideogroup.userId, userId)))
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
      .select({ tagId: appVideotag.tagId })
      .from(appVideotag)
      .where(eq(appVideotag.videoId, videoId));
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
      .from(appTag)
      .where(and(eq(appTag.userId, userId), inArray(appTag.id, tagIds)));
    return rows[0].c;
  });
}

/**
 * タグを動画へ付与（tx: 動画を FOR UPDATE → 既存を除外 → 一括 INSERT）。
 * DjangoTagRepository.add_tags_to_video 相当。ids_to_add は呼び出し側で
 * dedupe + attached 除外済み前提。返り値は (added, skippedInPersist)。
 */
export async function attachTags(
  env: Bindings,
  videoId: number,
  idsToAdd: number[],
): Promise<{ added: number; skippedInPersist: number }> {
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM app_video WHERE id = ${videoId} FOR UPDATE`);

      const existing = await tx
        .select({ tagId: appVideotag.tagId })
        .from(appVideotag)
        .where(
          and(eq(appVideotag.videoId, videoId), inArray(appVideotag.tagId, idsToAdd)),
        );
      const existingSet = new Set(existing.map((r) => Number(r.tagId)));
      const toAdd = idsToAdd.filter((id) => !existingSet.has(id));
      if (toAdd.length > 0) {
        await tx.execute(sql`
          INSERT INTO app_videotag (video_id, tag_id, added_at)
          SELECT ${videoId}, t, CURRENT_TIMESTAMP FROM unnest(${toAdd}::bigint[]) AS t
        `);
      }
      return { added: toAdd.length, skippedInPersist: idsToAdd.length - toAdd.length };
    }),
  );
}

/** VideoTag(video_id, tag_id) の存在（assert_has_tag 相当）。 */
export async function videoTagExists(
  env: Bindings,
  videoId: number,
  tagId: number,
): Promise<boolean> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ id: appVideotag.id })
      .from(appVideotag)
      .where(and(eq(appVideotag.videoId, videoId), eq(appVideotag.tagId, tagId)))
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
      .delete(appVideotag)
      .where(and(eq(appVideotag.videoId, videoId), eq(appVideotag.tagId, tagId)));
  });
}

// =========================================================================
// group ↔ video（単体）
// =========================================================================

/**
 * 動画 1 件をグループに追加（tx: group を FOR UPDATE → 既存なら alreadyIn →
 * order = MAX+1 で作成）。DjangoVideoGroupRepository.add_video 相当。
 */
export async function addVideoToGroup(
  env: Bindings,
  groupId: number,
  videoId: number,
): Promise<{ alreadyIn: true } | { id: number }> {
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM app_videogroup WHERE id = ${groupId} FOR UPDATE`);

      const exists = await tx
        .select({ id: appVideogroupmember.id })
        .from(appVideogroupmember)
        .where(
          and(
            eq(appVideogroupmember.groupId, groupId),
            eq(appVideogroupmember.videoId, videoId),
          ),
        )
        .limit(1);
      if (exists.length > 0) {
        return { alreadyIn: true } as const;
      }

      const rows = await tx
        .insert(appVideogroupmember)
        .values({
          groupId,
          videoId,
          order: sql`(SELECT COALESCE(MAX("order"), -1) + 1 FROM app_videogroupmember WHERE group_id = ${groupId})`,
          addedAt: sql`CURRENT_TIMESTAMP`,
        })
        .returning({ id: appVideogroupmember.id });
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
      await tx.execute(sql`SELECT 1 FROM app_videogroup WHERE id = ${groupId} FOR UPDATE`);
      const rows = await tx
        .delete(appVideogroupmember)
        .where(
          and(
            eq(appVideogroupmember.groupId, groupId),
            eq(appVideogroupmember.videoId, videoId),
          ),
        )
        .returning({ id: appVideogroupmember.id });
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
      .select({ videoId: appVideogroupmember.videoId })
      .from(appVideogroupmember)
      .where(eq(appVideogroupmember.groupId, groupId));
    return rows.map((row) => Number(row.videoId));
  });
}

/** user が所有する動画 id の集合（get_existing_ids_for_user 相当）。 */
export async function getExistingVideoIdsForUser(
  env: Bindings,
  videoIds: number[],
  userId: number,
): Promise<Set<number>> {
  if (videoIds.length === 0) return new Set();
  return withDb(env, async (db) => {
    const rows = await db
      .select({ id: appVideo.id })
      .from(appVideo)
      .where(and(inArray(appVideo.id, videoIds), eq(appVideo.userId, userId)));
    return new Set(rows.map((row) => Number(row.id)));
  });
}

/**
 * 動画を一括追加（tx: group を FOR UPDATE → Video 実在 & 未メンバーのみ →
 * order = base+idx で bulk INSERT）。add_videos_bulk 相当。返り値は added。
 */
export async function addVideosBulk(
  env: Bindings,
  groupId: number,
  idsToAdd: number[],
): Promise<number> {
  if (idsToAdd.length === 0) return 0;
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM app_videogroup WHERE id = ${groupId} FOR UPDATE`);

      const videosRes = await tx
        .select({ id: appVideo.id })
        .from(appVideo)
        .where(inArray(appVideo.id, idsToAdd));
      const videoSet = new Set(videosRes.map((r) => Number(r.id)));

      const memberRes = await tx
        .select({ videoId: appVideogroupmember.videoId })
        .from(appVideogroupmember)
        .where(
          and(
            eq(appVideogroupmember.groupId, groupId),
            inArray(appVideogroupmember.videoId, idsToAdd),
          ),
        );
      const memberSet = new Set(memberRes.map((r) => Number(r.videoId)));

      const videosToAdd = idsToAdd.filter((id) => videoSet.has(id) && !memberSet.has(id));
      if (videosToAdd.length === 0) return 0;

      await tx.execute(sql`
        INSERT INTO app_videogroupmember (group_id, video_id, "order", added_at)
        SELECT ${groupId}, v.video_id,
               (SELECT COALESCE(MAX("order"), -1) FROM app_videogroupmember WHERE group_id = ${groupId}) + v.ord,
               CURRENT_TIMESTAMP
          FROM unnest(${videosToAdd}::bigint[]) WITH ORDINALITY AS v(video_id, ord)
      `);
      return videosToAdd.length;
    }),
  );
}
