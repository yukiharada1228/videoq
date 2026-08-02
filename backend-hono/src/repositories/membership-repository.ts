import { withDb } from "../db/pool";
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
  return withDb(env, async (db, client) => {
    const r = await client.query(
      `SELECT 1 FROM app_video WHERE id = $1 AND user_id = $2`,
      [videoId, userId],
    );
    return r.rowCount! > 0;
  });
}

export async function groupOwnedBy(
  env: Bindings,
  groupId: number,
  userId: number,
): Promise<boolean> {
  return withDb(env, async (db, client) => {
    const r = await client.query(
      `SELECT 1 FROM app_videogroup WHERE id = $1 AND user_id = $2`,
      [groupId, userId],
    );
    return r.rowCount! > 0;
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
  return withDb(env, async (db, client) => {
    const r = await client.query(
      `SELECT tag_id FROM app_videotag WHERE video_id = $1`,
      [videoId],
    );
    return r.rows.map((row) => Number(row.tag_id));
  });
}

/** user が所有する対象タグの件数（SomeTagsNotFound 判定用）。 */
export async function countOwnedTags(
  env: Bindings,
  tagIds: number[],
  userId: number,
): Promise<number> {
  if (tagIds.length === 0) return 0;
  return withDb(env, async (db, client) => {
    const r = await client.query(
      `SELECT count(*)::int AS c FROM app_tag WHERE user_id = $1 AND id = ANY($2::bigint[])`,
      [userId, tagIds],
    );
    return r.rows[0].c;
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
  return withDb(env, async (db, client) => {
    await client.query("BEGIN");
    try {
      await client.query(`SELECT 1 FROM app_video WHERE id = $1 FOR UPDATE`, [videoId]);
      const existing = await client.query(
        `SELECT tag_id FROM app_videotag WHERE video_id = $1 AND tag_id = ANY($2::bigint[])`,
        [videoId, idsToAdd],
      );
      const existingSet = new Set(existing.rows.map((r) => Number(r.tag_id)));
      const toAdd = idsToAdd.filter((id) => !existingSet.has(id));
      if (toAdd.length > 0) {
        await client.query(
          `INSERT INTO app_videotag (video_id, tag_id, added_at)
           SELECT $1, t, CURRENT_TIMESTAMP FROM unnest($2::bigint[]) AS t`,
          [videoId, toAdd],
        );
      }
      await client.query("COMMIT");
      return { added: toAdd.length, skippedInPersist: idsToAdd.length - toAdd.length };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
}

/** VideoTag(video_id, tag_id) の存在（assert_has_tag 相当）。 */
export async function videoTagExists(
  env: Bindings,
  videoId: number,
  tagId: number,
): Promise<boolean> {
  return withDb(env, async (db, client) => {
    const r = await client.query(
      `SELECT 1 FROM app_videotag WHERE video_id = $1 AND tag_id = $2`,
      [videoId, tagId],
    );
    return r.rowCount! > 0;
  });
}

/** タグを動画から剥がす（存在は呼び出し側で確認済み前提）。 */
export async function detachTag(
  env: Bindings,
  videoId: number,
  tagId: number,
): Promise<void> {
  return withDb(env, async (db, client) => {
    await client.query(
      `DELETE FROM app_videotag WHERE video_id = $1 AND tag_id = $2`,
      [videoId, tagId],
    );
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
  return withDb(env, async (db, client) => {
    await client.query("BEGIN");
    try {
      await client.query(`SELECT 1 FROM app_videogroup WHERE id = $1 FOR UPDATE`, [groupId]);
      const exists = await client.query(
        `SELECT 1 FROM app_videogroupmember WHERE group_id = $1 AND video_id = $2`,
        [groupId, videoId],
      );
      if (exists.rowCount! > 0) {
        await client.query("ROLLBACK");
        return { alreadyIn: true } as const;
      }
      const { rows } = await client.query(
        `INSERT INTO app_videogroupmember (group_id, video_id, "order", added_at)
         VALUES ($1, $2,
           (SELECT COALESCE(MAX("order"), -1) + 1 FROM app_videogroupmember WHERE group_id = $1),
           CURRENT_TIMESTAMP)
         RETURNING id`,
        [groupId, videoId],
      );
      await client.query("COMMIT");
      return { id: Number(rows[0].id) } as const;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
}

/** 動画 1 件をグループから除去（tx: 非メンバーなら notMember）。 */
export async function removeVideoFromGroup(
  env: Bindings,
  groupId: number,
  videoId: number,
): Promise<{ notMember: true } | { ok: true }> {
  return withDb(env, async (db, client) => {
    await client.query("BEGIN");
    try {
      await client.query(`SELECT 1 FROM app_videogroup WHERE id = $1 FOR UPDATE`, [groupId]);
      const r = await client.query(
        `DELETE FROM app_videogroupmember WHERE group_id = $1 AND video_id = $2`,
        [groupId, videoId],
      );
      await client.query("COMMIT");
      return r.rowCount! > 0 ? ({ ok: true } as const) : ({ notMember: true } as const);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
}

// =========================================================================
// group ↔ video（一括）
// =========================================================================

/** グループの現メンバー video_id 一覧（plan_bulk_add 用）。 */
export async function getGroupMemberVideoIds(
  env: Bindings,
  groupId: number,
): Promise<number[]> {
  return withDb(env, async (db, client) => {
    const r = await client.query(
      `SELECT video_id FROM app_videogroupmember WHERE group_id = $1`,
      [groupId],
    );
    return r.rows.map((row) => Number(row.video_id));
  });
}

/** user が所有する動画 id の集合（get_existing_ids_for_user 相当）。 */
export async function getExistingVideoIdsForUser(
  env: Bindings,
  videoIds: number[],
  userId: number,
): Promise<Set<number>> {
  if (videoIds.length === 0) return new Set();
  return withDb(env, async (db, client) => {
    const r = await client.query(
      `SELECT id FROM app_video WHERE id = ANY($1::bigint[]) AND user_id = $2`,
      [videoIds, userId],
    );
    return new Set(r.rows.map((row) => Number(row.id)));
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
  return withDb(env, async (db, client) => {
    await client.query("BEGIN");
    try {
      await client.query(`SELECT 1 FROM app_videogroup WHERE id = $1 FOR UPDATE`, [groupId]);

      const videosRes = await client.query(
        `SELECT id FROM app_video WHERE id = ANY($1::bigint[])`,
        [idsToAdd],
      );
      const videoSet = new Set(videosRes.rows.map((r) => Number(r.id)));
      const memberRes = await client.query(
        `SELECT video_id FROM app_videogroupmember WHERE group_id = $1 AND video_id = ANY($2::bigint[])`,
        [groupId, idsToAdd],
      );
      const memberSet = new Set(memberRes.rows.map((r) => Number(r.video_id)));

      // idsToAdd の順を保ちつつ、実在 & 未メンバーのみ（repo の enumerate 順に一致）
      const videosToAdd = idsToAdd.filter((id) => videoSet.has(id) && !memberSet.has(id));
      if (videosToAdd.length === 0) {
        await client.query("COMMIT");
        return 0;
      }

      await client.query(
        `INSERT INTO app_videogroupmember (group_id, video_id, "order", added_at)
         SELECT $1, v.video_id,
                (SELECT COALESCE(MAX("order"), -1) FROM app_videogroupmember WHERE group_id = $1) + v.ord,
                CURRENT_TIMESTAMP
           FROM unnest($2::bigint[]) WITH ORDINALITY AS v(video_id, ord)`,
        [groupId, videosToAdd],
      );
      await client.query("COMMIT");
      return videosToAdd.length;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
}
