import { withDb } from "../db/pool";
import { APP_TIMEZONE, normalizeDrfDatetime } from "../utils/datetime";
import {
  TAGS_SUBQUERY,
  mapVideoListRow,
  type VideoListItem,
} from "./video-repository";
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
// VideoGroupDetailSerializer: 一覧 + updated_at / share_slug / videos（ネスト）
export type GroupDetail = {
  id: number;
  name: string;
  description: string;
  display_order: number;
  created_at: string;
  updated_at: string;
  video_count: number;
  share_slug: string | null;
  videos: (VideoListItem & { order: number })[];
};

/**
 * 指定 WHERE 条件でグループ詳細を1件取得（VideoGroupDetailSerializer 形）。
 * 未一致は null。videos は各メンバーの VideoListSerializer 出力 + order。
 */
async function fetchGroupDetail(
  env: Bindings,
  whereSql: string,
  whereParams: unknown[],
): Promise<GroupDetail | null> {
  const data = await withDb(env, async (db, client) => {
    await client.query(`SET timezone = '${APP_TIMEZONE}'`);

    const groupRes = await client.query(
      `SELECT g.id, g.name, g.description, g.display_order,
              to_char(g.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF') AS created_at,
              to_char(g.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF') AS updated_at,
              g.share_slug,
              (SELECT count(DISTINCT m.video_id) FROM app_videogroupmember m
                WHERE m.group_id = g.id)::int AS video_count
         FROM app_videogroup g
        WHERE ${whereSql}`,
      whereParams,
    );
    if (groupRes.rows.length === 0) return null;
    const groupId = Number(groupRes.rows[0].id);

    // ネスト videos: メンバー順（order, added_at）で VideoListSerializer 相当 + order
    const memberRes = await client.query(
      `SELECT m."order" AS member_order,
              v.id, v.file, v.title, v.description,
              to_char(v.uploaded_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF') AS uploaded_at,
              v.status, v.source_type, v.source_url, v.youtube_video_id,
              ${TAGS_SUBQUERY} AS tags
         FROM app_videogroupmember m
         JOIN app_video v ON v.id = m.video_id
        WHERE m.group_id = $1
        ORDER BY m."order" ASC, m.added_at ASC`,
      [groupId],
    );
    return { group: groupRes.rows[0], members: memberRes.rows };
  });

  if (!data) return null;

  const videos = await Promise.all(
    data.members.map(async (r) => ({
      ...(await mapVideoListRow(env, r)),
      order: r.member_order as number,
    })),
  );

  const g = data.group;
  return {
    id: Number(g.id),
    name: g.name,
    description: g.description,
    display_order: g.display_order,
    created_at: normalizeDrfDatetime(g.created_at),
    updated_at: normalizeDrfDatetime(g.updated_at),
    video_count: g.video_count,
    share_slug: g.share_slug ?? null,
    videos,
  };
}

/**
 * VideoGroupDetailView: id + user_id で1件取得（未所有/不在は null）。
 * videos は各メンバーの VideoListSerializer 出力 + order（メンバー順 order, added_at）。
 */
export function getGroupDetail(
  env: Bindings,
  groupId: number,
  userId: number,
): Promise<GroupDetail | null> {
  return fetchGroupDetail(env, "g.id = $1 AND g.user_id = $2", [groupId, userId]);
}

/**
 * get_shared_group: share_slug で1件取得（認証不要・完全一致）。未一致は null。
 * 出力は VideoGroupDetailSerializer（getGroupDetail と同形）。
 */
export function getGroupDetailByShareSlug(
  env: Bindings,
  shareSlug: string,
): Promise<GroupDetail | null> {
  return fetchGroupDetail(env, "g.share_slug = $1", [shareSlug]);
}

/** グループ作成（display_order = MAX+1 を単一 INSERT で原子採番）。作成した id を返す。 */
export async function createGroup(
  env: Bindings,
  userId: number,
  name: string,
  description: string,
): Promise<number> {
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `INSERT INTO app_videogroup
         (user_id, name, description, display_order, created_at, updated_at, share_slug)
       VALUES ($1, $2, $3,
         (SELECT COALESCE(MAX(display_order), -1) + 1 FROM app_videogroup WHERE user_id = $1),
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
       RETURNING id`,
      [userId, name, description],
    );
    return Number(rows[0].id);
  });
}

/** グループ更新（提供フィールドのみ動的 SET。updated_at は更新しない=現行互換）。 */
export async function updateGroup(
  env: Bindings,
  groupId: number,
  userId: number,
  fields: { name?: string; description?: string },
): Promise<{ notFound: true } | { ok: true }> {
  return withDb(env, async (db, client) => {
    const owner = await client.query(
      `SELECT id FROM app_videogroup WHERE id = $1 AND user_id = $2`,
      [groupId, userId],
    );
    if (owner.rowCount === 0) return { notFound: true } as const;

    const sets: string[] = [];
    const params: unknown[] = [groupId, userId];
    if (fields.name !== undefined) {
      params.push(fields.name);
      sets.push(`name = $${params.length}`);
    }
    if (fields.description !== undefined) {
      params.push(fields.description);
      sets.push(`description = $${params.length}`);
    }
    if (sets.length > 0) {
      await client.query(
        `UPDATE app_videogroup SET ${sets.join(", ")} WHERE id = $1 AND user_id = $2`,
        params,
      );
    }
    return { ok: true } as const;
  });
}

/** グループ削除（所有権を先に確認し、tx で cascade 削除）。 */
export async function deleteGroup(
  env: Bindings,
  groupId: number,
  userId: number,
): Promise<{ notFound: true } | { ok: true }> {
  return withDb(env, async (db, client) => {
    await client.query("BEGIN");
    try {
      const owner = await client.query(
        `SELECT id FROM app_videogroup WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [groupId, userId],
      );
      if (owner.rowCount === 0) {
        await client.query("ROLLBACK");
        return { notFound: true } as const;
      }
      await client.query(
        `DELETE FROM app_chatlogevaluation
          WHERE chat_log_id IN (SELECT id FROM app_chatlog WHERE group_id = $1)`,
        [groupId],
      );
      await client.query(`DELETE FROM app_chatlog WHERE group_id = $1`, [groupId]);
      await client.query(`DELETE FROM app_videogroupmember WHERE group_id = $1`, [groupId]);
      await client.query(
        `DELETE FROM app_videogroup WHERE id = $1 AND user_id = $2`,
        [groupId, userId],
      );
      await client.query("COMMIT");
      return { ok: true } as const;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
}

/**
 * グループ表示順の並び替え（reorder_groups 相当）。
 * 空/重複 → mismatch。選択グループの既存 display_order 値集合を
 * ソート順のまま group_ids の並びへ再割り当て（値集合は保存）。
 */
export async function reorderGroups(
  env: Bindings,
  userId: number,
  groupIds: number[],
): Promise<{ mismatch: true } | { ok: true }> {
  if (groupIds.length === 0) return { mismatch: true } as const;
  if (new Set(groupIds).size !== groupIds.length) return { mismatch: true } as const;

  return withDb(env, async (db, client) => {
    await client.query("BEGIN");
    try {
      const sel = await client.query(
        `SELECT id, display_order FROM app_videogroup
          WHERE user_id = $1 AND id = ANY($2::bigint[])
          ORDER BY display_order ASC, created_at DESC, id ASC
          FOR UPDATE`,
        [userId, groupIds],
      );
      if (sel.rowCount !== groupIds.length) {
        await client.query("ROLLBACK");
        return { mismatch: true } as const;
      }
      // 既存 display_order のソート済み集合を group_ids の順へ zip 割り当て
      const slots = sel.rows.map((r) => r.display_order as number);
      await client.query(
        `UPDATE app_videogroup AS g SET display_order = d.slot
           FROM unnest($2::bigint[], $3::int[]) AS d(gid, slot)
          WHERE g.id = d.gid AND g.user_id = $1`,
        [userId, groupIds, slots],
      );
      await client.query("COMMIT");
      return { ok: true } as const;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
}

/**
 * グループ内動画の並び替え（reorder_videos 相当）。order = 0 始まりの連番。
 * 呼び出し側で「メンバー集合と一致」を検証済み前提。
 */
export async function reorderVideos(
  env: Bindings,
  groupId: number,
  videoIds: number[],
): Promise<void> {
  return withDb(env, async (db, client) => {
    await client.query("BEGIN");
    try {
      await client.query(`SELECT 1 FROM app_videogroup WHERE id = $1 FOR UPDATE`, [groupId]);
      if (videoIds.length > 0) {
        await client.query(
          `UPDATE app_videogroupmember AS m SET "order" = v.ord - 1
             FROM unnest($2::bigint[]) WITH ORDINALITY AS v(video_id, ord)
            WHERE m.group_id = $1 AND m.video_id = v.video_id`,
          [groupId, videoIds],
        );
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
}

/** グループの現在の share_slug（グループ不在/未所有は found:false）。 */
export async function getGroupShareSlug(
  env: Bindings,
  groupId: number,
  userId: number,
): Promise<{ found: false } | { found: true; slug: string | null }> {
  return withDb(env, async (db, client) => {
    const r = await client.query(
      `SELECT share_slug FROM app_videogroup WHERE id = $1 AND user_id = $2`,
      [groupId, userId],
    );
    if (r.rowCount === 0) return { found: false } as const;
    return { found: true, slug: (r.rows[0].share_slug ?? null) as string | null };
  });
}

/**
 * share_slug を設定/解除（update_share_slug 相当）。CI unique 違反(23505)は conflict。
 * slug=null で解除。
 */
export async function setShareSlug(
  env: Bindings,
  groupId: number,
  userId: number,
  slug: string | null,
): Promise<{ conflict: true } | { ok: true }> {
  return withDb(env, async (db, client) => {
    try {
      await client.query(
        `UPDATE app_videogroup SET share_slug = $3 WHERE id = $1 AND user_id = $2`,
        [groupId, userId, slug],
      );
      return { ok: true } as const;
    } catch (e) {
      if ((e as { code?: string }).code === "23505") return { conflict: true } as const;
      throw e;
    }
  });
}

export async function listGroupsPage(
  env: Bindings,
  userId: number,
  limit: number,
  offset: number,
): Promise<{ count: number; results: GroupListItem[] }> {
  return withDb(env, async (db, client) => {
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
