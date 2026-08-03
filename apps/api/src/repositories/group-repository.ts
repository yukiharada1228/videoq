import { and, asc, desc, eq, type SQL, sql } from "drizzle-orm";
import { withDb } from "../db/pool";
import { sqlNumberArray } from "../db/sql-array";
import {
  chatLogs,
  chatLogEvaluations,
  videos,
  videoGroups,
  videoGroupMembers,
} from "../db/schema";
import { toUtcIso } from "../shared/datetime";
import { mapVideoListRow, type VideoListItem } from "./video-repository";
import type { Bindings } from "../types/bindings";

/** VideoGroup 一覧 API のレスポンス表現。 */
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
 * 並び: display_order ASC, created_at DESC, id ASC。
 * video_count は所属する動画の重複を除いた件数。
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

const groupVideoCount = sql<number>`(SELECT count(DISTINCT m.video_id)::int FROM video_group_members m WHERE m.group_id = ${videoGroups.id})`.as(
  "video_count",
);
// Outer table must be qualified — ${videos.id} becomes bare "id" (ambiguous vs t.id).
const videoTagsJson = sql<string>`COALESCE((
  SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color) ORDER BY t.name)
  FROM video_tags vt JOIN tags t ON t.id = vt.tag_id
  WHERE vt.video_id = "videos"."id"
), '[]'::json)::text`.as("tags");

/**
 * 指定 WHERE 条件でグループ詳細を1件取得（VideoGroupDetailSerializer 形）。
 * 未一致は null。videos は各メンバーの動画一覧表現 + order。
 */
async function fetchGroupDetail(
  env: Bindings,
  where: SQL,
): Promise<GroupDetail | null> {
  const data = await withDb(env, async (db) => {
    const groupRows = await db
      .select({
        id: videoGroups.id,
        name: videoGroups.name,
        description: videoGroups.description,
        display_order: videoGroups.displayOrder,
        created_at: videoGroups.createdAt,
        updated_at: videoGroups.updatedAt,
        share_slug: videoGroups.shareSlug,
        video_count: groupVideoCount,
      })
      .from(videoGroups)
      .where(where)
      .limit(1);
    if (groupRows.length === 0) return null;
    const groupId = Number(groupRows[0].id);

    const memberRows = await db
      .select({
        member_order: videoGroupMembers.order,
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
      .from(videoGroupMembers)
      .innerJoin(videos, eq(videos.id, videoGroupMembers.videoId))
      .where(eq(videoGroupMembers.groupId, groupId))
      .orderBy(asc(videoGroupMembers.order), asc(videoGroupMembers.addedAt));

    return { group: groupRows[0], members: memberRows };
  });

  if (!data) return null;

  const nestedVideos = await Promise.all(
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
    created_at: toUtcIso(g.created_at)!,
    updated_at: toUtcIso(g.updated_at)!,
    video_count: g.video_count,
    share_slug: g.share_slug ?? null,
    videos: nestedVideos,
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
    and(eq(videoGroups.id, groupId), eq(videoGroups.userId, userId))!,
  );
}

/**
 * share_slug で1件取得する（認証不要・完全一致）。未一致は null。
 * 出力は VideoGroupDetailSerializer（getGroupDetail と同形）。
 */
export function getGroupDetailByShareSlug(
  env: Bindings,
  shareSlug: string,
): Promise<GroupDetail | null> {
  return fetchGroupDetail(env, eq(videoGroups.shareSlug, shareSlug));
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
      .insert(videoGroups)
      .values({
        userId,
        name,
        description,
        displayOrder: sql`(SELECT COALESCE(MAX(display_order), -1) + 1 FROM video_groups WHERE user_id = ${userId})`,
        createdAt: sql`CURRENT_TIMESTAMP`,
        updatedAt: sql`CURRENT_TIMESTAMP`,
        shareSlug: null,
      })
      .returning({ id: videoGroups.id });
    return Number(rows[0].id);
  });
}

/** グループ更新（提供フィールドのみ動的 SET。updated_at は更新しない）。 */
export async function updateGroup(
  env: Bindings,
  groupId: number,
  userId: number,
  fields: { name?: string; description?: string },
): Promise<{ notFound: true } | { ok: true }> {
  return withDb(env, async (db) => {
    const owner = await db
      .select({ id: videoGroups.id })
      .from(videoGroups)
      .where(and(eq(videoGroups.id, groupId), eq(videoGroups.userId, userId)))
      .limit(1);
    if (owner.length === 0) return { notFound: true } as const;

    const patch: { name?: string; description?: string } = {};
    if (fields.name !== undefined) patch.name = fields.name;
    if (fields.description !== undefined) patch.description = fields.description;
    if (Object.keys(patch).length > 0) {
      await db
        .update(videoGroups)
        .set(patch)
        .where(and(eq(videoGroups.id, groupId), eq(videoGroups.userId, userId)));
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
        .select({ id: videoGroups.id })
        .from(videoGroups)
        .where(and(eq(videoGroups.id, groupId), eq(videoGroups.userId, userId)))
        .for("update");
      if (owner.length === 0) return { notFound: true } as const;

      await tx.execute(sql`
        DELETE FROM chat_log_evaluations
         WHERE chat_log_id IN (SELECT id FROM chat_logs WHERE group_id = ${groupId})
      `);
      await tx.delete(chatLogs).where(eq(chatLogs.groupId, groupId));
      await tx.delete(videoGroupMembers).where(eq(videoGroupMembers.groupId, groupId));
      await tx
        .delete(videoGroups)
        .where(and(eq(videoGroups.id, groupId), eq(videoGroups.userId, userId)));
      return { ok: true } as const;
    });
  });
}

/**
 * グループ表示順を並び替える。
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
        SELECT id, display_order FROM video_groups
         WHERE user_id = ${userId} AND id = ANY(${sqlNumberArray(groupIds)})
         ORDER BY display_order ASC, created_at DESC, id ASC
         FOR UPDATE
      `);
      const rows = sel.rows as Array<{ id: number; display_order: number }>;
      if (rows.length !== groupIds.length) return { mismatch: true } as const;
      const slots = rows.map((r) => r.display_order);
      await tx.execute(sql`
        UPDATE video_groups AS g SET display_order = d.slot
          FROM unnest(${sqlNumberArray(groupIds)}, ${sqlNumberArray(slots, "int")}) AS d(gid, slot)
         WHERE g.id = d.gid AND g.user_id = ${userId}
      `);
      return { ok: true } as const;
    });
  });
}

/**
 * グループ内動画を並び替える。order = 0 始まりの連番。
 * 呼び出し側で「メンバー集合と一致」を検証済み前提。
 */
export async function reorderVideos(
  env: Bindings,
  groupId: number,
  videoIds: number[],
): Promise<void> {
  return withDb(env, async (db) => {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM video_groups WHERE id = ${groupId} FOR UPDATE`);
      if (videoIds.length > 0) {
        await tx.execute(sql`
          UPDATE video_group_members AS m SET "order" = v.ord - 1
            FROM unnest(${sqlNumberArray(videoIds)}) WITH ORDINALITY AS v(video_id, ord)
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
      .select({ share_slug: videoGroups.shareSlug })
      .from(videoGroups)
      .where(and(eq(videoGroups.id, groupId), eq(videoGroups.userId, userId)))
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
  groupId: number,
  userId: number,
  slug: string | null,
): Promise<{ conflict: true } | { ok: true }> {
  return withDb(env, async (db) => {
    try {
      await db
        .update(videoGroups)
        .set({ shareSlug: slug })
        .where(and(eq(videoGroups.id, groupId), eq(videoGroups.userId, userId)));
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
    const countRows = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(videoGroups)
      .where(eq(videoGroups.userId, userId));

    const rows = await db
      .select({
        id: videoGroups.id,
        name: videoGroups.name,
        description: videoGroups.description,
        display_order: videoGroups.displayOrder,
        created_at: videoGroups.createdAt,
        video_count: groupVideoCount,
      })
      .from(videoGroups)
      .where(eq(videoGroups.userId, userId))
      .orderBy(
        asc(videoGroups.displayOrder),
        desc(videoGroups.createdAt),
        asc(videoGroups.id),
      )
      .limit(limit)
      .offset(offset);

    const results: GroupListItem[] = rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      description: r.description,
      display_order: r.display_order,
      created_at: toUtcIso(r.created_at)!,
      video_count: r.video_count,
    }));
    return { count: countRows[0].c, results };
  });
}
