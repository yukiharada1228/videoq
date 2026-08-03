import { and, asc, desc, eq, type SQL, sql } from "drizzle-orm";
import { withDb } from "../db/pool";
import {
  appChatlog,
  appChatlogevaluation,
  appVideo,
  appVideogroup,
  appVideogroupmember,
} from "../db/schema";
import { APP_TIMEZONE, normalizeDrfDatetime } from "../utils/datetime";
import { mapVideoListRow, type VideoListItem } from "./video-repository";
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

const createdAtDrf = sql<string>`to_char(${appVideogroup.createdAt}, 'YYYY-MM-DD"T"HH24:MI:SS.USOF')`.as(
  "created_at",
);
const updatedAtDrf = sql<string>`to_char(${appVideogroup.updatedAt}, 'YYYY-MM-DD"T"HH24:MI:SS.USOF')`.as(
  "updated_at",
);
const uploadedAtDrf = sql<string>`to_char(${appVideo.uploadedAt}, 'YYYY-MM-DD"T"HH24:MI:SS.USOF')`.as(
  "uploaded_at",
);
const groupVideoCount = sql<number>`(SELECT count(DISTINCT m.video_id)::int FROM app_videogroupmember m WHERE m.group_id = ${appVideogroup.id})`.as(
  "video_count",
);
// Outer table must be qualified — ${appVideo.id} becomes bare "id" (ambiguous vs t.id).
const videoTagsJson = sql<string>`COALESCE((
  SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color) ORDER BY t.name)
  FROM app_videotag vt JOIN app_tag t ON t.id = vt.tag_id
  WHERE vt.video_id = "app_video"."id"
), '[]'::json)::text`.as("tags");

/**
 * 指定 WHERE 条件でグループ詳細を1件取得（VideoGroupDetailSerializer 形）。
 * 未一致は null。videos は各メンバーの VideoListSerializer 出力 + order。
 */
async function fetchGroupDetail(
  env: Bindings,
  where: SQL,
): Promise<GroupDetail | null> {
  const data = await withDb(env, async (db) => {
    await db.execute(sql.raw(`SET timezone = '${APP_TIMEZONE}'`));

    const groupRows = await db
      .select({
        id: appVideogroup.id,
        name: appVideogroup.name,
        description: appVideogroup.description,
        display_order: appVideogroup.displayOrder,
        created_at: createdAtDrf,
        updated_at: updatedAtDrf,
        share_slug: appVideogroup.shareSlug,
        video_count: groupVideoCount,
      })
      .from(appVideogroup)
      .where(where)
      .limit(1);
    if (groupRows.length === 0) return null;
    const groupId = Number(groupRows[0].id);

    const memberRows = await db
      .select({
        member_order: appVideogroupmember.order,
        id: appVideo.id,
        file: appVideo.file,
        title: appVideo.title,
        description: appVideo.description,
        uploaded_at: uploadedAtDrf,
        status: appVideo.status,
        source_type: appVideo.sourceType,
        source_url: appVideo.sourceUrl,
        youtube_video_id: appVideo.youtubeVideoId,
        tags: videoTagsJson,
      })
      .from(appVideogroupmember)
      .innerJoin(appVideo, eq(appVideo.id, appVideogroupmember.videoId))
      .where(eq(appVideogroupmember.groupId, groupId))
      .orderBy(asc(appVideogroupmember.order), asc(appVideogroupmember.addedAt));

    return { group: groupRows[0], members: memberRows };
  });

  if (!data) return null;

  const videos = await Promise.all(
    data.members.map(async (r) => ({
      ...(await mapVideoListRow(env, r)),
      order: r.member_order,
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
  return fetchGroupDetail(
    env,
    and(eq(appVideogroup.id, groupId), eq(appVideogroup.userId, userId))!,
  );
}

/**
 * get_shared_group: share_slug で1件取得（認証不要・完全一致）。未一致は null。
 * 出力は VideoGroupDetailSerializer（getGroupDetail と同形）。
 */
export function getGroupDetailByShareSlug(
  env: Bindings,
  shareSlug: string,
): Promise<GroupDetail | null> {
  return fetchGroupDetail(env, eq(appVideogroup.shareSlug, shareSlug));
}

/** グループ作成（display_order = MAX+1 を単一 INSERT で原子採番）。作成した id を返す。 */
export async function createGroup(
  env: Bindings,
  userId: number,
  name: string,
  description: string,
): Promise<number> {
  return withDb(env, async (db) => {
    const rows = await db
      .insert(appVideogroup)
      .values({
        userId,
        name,
        description,
        displayOrder: sql`(SELECT COALESCE(MAX(display_order), -1) + 1 FROM app_videogroup WHERE user_id = ${userId})`,
        createdAt: sql`CURRENT_TIMESTAMP`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
        shareSlug: null,
      })
      .returning({ id: appVideogroup.id });
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
  return withDb(env, async (db) => {
    const owner = await db
      .select({ id: appVideogroup.id })
      .from(appVideogroup)
      .where(and(eq(appVideogroup.id, groupId), eq(appVideogroup.userId, userId)))
      .limit(1);
    if (owner.length === 0) return { notFound: true } as const;

    const patch: { name?: string; description?: string } = {};
    if (fields.name !== undefined) patch.name = fields.name;
    if (fields.description !== undefined) patch.description = fields.description;
    if (Object.keys(patch).length > 0) {
      await db
        .update(appVideogroup)
        .set(patch)
        .where(and(eq(appVideogroup.id, groupId), eq(appVideogroup.userId, userId)));
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
  return withDb(env, async (db) => {
    return db.transaction(async (tx) => {
      const owner = await tx
        .select({ id: appVideogroup.id })
        .from(appVideogroup)
        .where(and(eq(appVideogroup.id, groupId), eq(appVideogroup.userId, userId)))
        .for("update");
      if (owner.length === 0) return { notFound: true } as const;

      await tx.execute(sql`
        DELETE FROM app_chatlogevaluation
         WHERE chat_log_id IN (SELECT id FROM app_chatlog WHERE group_id = ${groupId})
      `);
      await tx.delete(appChatlog).where(eq(appChatlog.groupId, groupId));
      await tx.delete(appVideogroupmember).where(eq(appVideogroupmember.groupId, groupId));
      await tx
        .delete(appVideogroup)
        .where(and(eq(appVideogroup.id, groupId), eq(appVideogroup.userId, userId)));
      return { ok: true } as const;
    });
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

  return withDb(env, async (db) => {
    return db.transaction(async (tx) => {
      const sel = await tx.execute(sql`
        SELECT id, display_order FROM app_videogroup
         WHERE user_id = ${userId} AND id = ANY(${groupIds}::bigint[])
         ORDER BY display_order ASC, created_at DESC, id ASC
         FOR UPDATE
      `);
      const rows = sel.rows as Array<{ id: number; display_order: number }>;
      if (rows.length !== groupIds.length) return { mismatch: true } as const;
      const slots = rows.map((r) => r.display_order);
      await tx.execute(sql`
        UPDATE app_videogroup AS g SET display_order = d.slot
          FROM unnest(${groupIds}::bigint[], ${slots}::int[]) AS d(gid, slot)
         WHERE g.id = d.gid AND g.user_id = ${userId}
      `);
      return { ok: true } as const;
    });
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
  return withDb(env, async (db) => {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM app_videogroup WHERE id = ${groupId} FOR UPDATE`);
      if (videoIds.length > 0) {
        await tx.execute(sql`
          UPDATE app_videogroupmember AS m SET "order" = v.ord - 1
            FROM unnest(${videoIds}::bigint[]) WITH ORDINALITY AS v(video_id, ord)
           WHERE m.group_id = ${groupId} AND m.video_id = v.video_id
        `);
      }
    });
  });
}

/** グループの現在の share_slug（グループ不在/未所有は found:false）。 */
export async function getGroupShareSlug(
  env: Bindings,
  groupId: number,
  userId: number,
): Promise<{ found: false } | { found: true; slug: string | null }> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ share_slug: appVideogroup.shareSlug })
      .from(appVideogroup)
      .where(and(eq(appVideogroup.id, groupId), eq(appVideogroup.userId, userId)))
      .limit(1);
    if (rows.length === 0) return { found: false } as const;
    return { found: true, slug: rows[0].share_slug ?? null };
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
  return withDb(env, async (db) => {
    try {
      await db
        .update(appVideogroup)
        .set({ shareSlug: slug })
        .where(and(eq(appVideogroup.id, groupId), eq(appVideogroup.userId, userId)));
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
  return withDb(env, async (db) => {
    await db.execute(sql.raw(`SET timezone = '${APP_TIMEZONE}'`));

    const countRows = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(appVideogroup)
      .where(eq(appVideogroup.userId, userId));

    const rows = await db
      .select({
        id: appVideogroup.id,
        name: appVideogroup.name,
        description: appVideogroup.description,
        display_order: appVideogroup.displayOrder,
        created_at: createdAtDrf,
        video_count: groupVideoCount,
      })
      .from(appVideogroup)
      .where(eq(appVideogroup.userId, userId))
      .orderBy(
        asc(appVideogroup.displayOrder),
        desc(appVideogroup.createdAt),
        asc(appVideogroup.id),
      )
      .limit(limit)
      .offset(offset);

    const results: GroupListItem[] = rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      description: r.description,
      display_order: r.display_order,
      created_at: normalizeDrfDatetime(r.created_at),
      video_count: r.video_count,
    }));
    return { count: countRows[0].c, results };
  });
}
