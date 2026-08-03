import { alias } from "drizzle-orm/pg-core";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { withDb } from "../db/pool";
import { tags, videos, videoTags } from "../db/schema";
import { toUtcIso } from "../shared/datetime";
import {
  TAGS_SUBQUERY,
  mapVideoListRow,
  type VideoListItem,
} from "./video-repository";
import type { Bindings } from "../types/bindings";

// TagPolicy.ALLOWED_COLORS（ChipLabel palette）。hex は不可。
export const TAG_COLORS = [
  "gray",
  "blue",
  "light-blue",
  "cyan",
  "green",
  "lime",
  "yellow",
  "orange",
  "red",
  "magenta",
  "purple",
] as const;

export const INVALID_COLOR_MESSAGE = `Invalid color. Use a ChipLabel palette name (${TAG_COLORS.join(", ")})`;
export const EMPTY_NAME_MESSAGE = "Tag name cannot be empty";

/** TagPolicy.normalize_name: strip → 空なら null（呼び出し側で 400）。 */
export function normalizeTagName(name: string): string | null {
  const s = name.trim();
  return s === "" ? null : s;
}

/** TagPolicy.validate_color: パレット名の完全一致のみ。 */
export function isValidTagColor(color: string): boolean {
  return (TAG_COLORS as readonly string[]).includes(color);
}

// Tag 一覧 API のレスポンス表現。
export type TagListItem = {
  id: number;
  name: string;
  color: string;
  created_at: string;
  video_count: number;
};

// Tag 詳細 API のレスポンス表現（TagList + ネスト videos）。
export type TagDetail = TagListItem & {
  videos: VideoListItem[];
};

const videoCountSubquery = sql<number>`(SELECT count(*) FROM video_tags vt WHERE vt.tag_id = ${tags.id})::int`.as(
  "video_count",
);

const tagListSelect = {
  id: tags.id,
  name: tags.name,
  color: tags.color,
  created_at: tags.createdAt,
  video_count: videoCountSubquery,
};

const v = alias(videos, "v");

/**
 * タグ一覧（ページ）。Tag.Meta.ordering=["name"] に従い name ASC。
 * video_count = Count("video_tags")（= video_tags の該当行数）。
 * count は総数、results は SQL の LIMIT/OFFSET で切ったページ。
 */
export async function listTagsPage(
  env: Bindings,
  userId: number,
  limit: number,
  offset: number,
): Promise<{ count: number; results: TagListItem[] }> {
  return withDb(env, async (db) => {
    const [countRow] = await db
      .select({ c: count() })
      .from(tags)
      .where(eq(tags.userId, userId));

    const rows = await db
      .select(tagListSelect)
      .from(tags)
      .where(eq(tags.userId, userId))
      .orderBy(asc(tags.name))
      .limit(limit)
      .offset(offset);

    const results: TagListItem[] = rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      color: r.color,
      created_at: toUtcIso(r.created_at)!,
      video_count: r.video_count,
    }));
    return { count: Number(countRow.c), results };
  });
}

/**
 * タグ詳細。未所有または不在は null。
 * videos は該当 VideoTag の動画一覧表現を返し、安定した挿入順として vt.id ASC を用いる。
 */
export async function getTagDetail(
  env: Bindings,
  tagId: number,
  userId: number,
): Promise<TagDetail | null> {
  const data = await withDb(env, async (db) => {
    const tagRows = await db
      .select(tagListSelect)
      .from(tags)
      .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
      .limit(1);
    if (tagRows.length === 0) return null;

    const videoRows = await db
      .select({
        id: v.id,
        file: v.file,
        title: v.title,
        description: v.description,
        uploaded_at: v.uploadedAt,
        status: v.status,
        source_type: v.sourceType,
        source_url: v.sourceUrl,
        youtube_video_id: v.youtubeVideoId,
        tags: sql<string>`${sql.raw(TAGS_SUBQUERY)}`.as("tags"),
      })
      .from(videoTags)
      .innerJoin(v, eq(videoTags.videoId, v.id))
      .where(eq(videoTags.tagId, tagId))
      .orderBy(asc(videoTags.id));

    return { tag: tagRows[0], videoRows };
  });

  if (!data) return null;

  const videos = await Promise.all(
    data.videoRows.map((r) => mapVideoListRow(env, r)),
  );

  const t = data.tag;
  return {
    id: Number(t.id),
    name: t.name,
    color: t.color,
    created_at: toUtcIso(t.created_at)!,
    video_count: t.video_count,
    videos,
  };
}

/** タグの存在（所有）確認。update で 404 を 400(ドメイン検証)より先に返すため。 */
export async function tagExists(
  env: Bindings,
  tagId: number,
  userId: number,
): Promise<boolean> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ x: sql<number>`1` })
      .from(tags)
      .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
      .limit(1);
    return rows.length > 0;
  });
}

/**
 * タグ更新（提供フィールドのみ動的 SET）。存在確認は呼び出し側で済ませる前提。
 * name×user 一意違反は現行同様に未処理（pg 23505 → 500）。
 */
export async function updateTag(
  env: Bindings,
  tagId: number,
  userId: number,
  fields: { name?: string; color?: string },
): Promise<void> {
  return withDb(env, async (db) => {
    const set: Partial<{ name: string; color: string }> = {};
    if (fields.name !== undefined) set.name = fields.name;
    if (fields.color !== undefined) set.color = fields.color;
    if (Object.keys(set).length === 0) return;

    await db
      .update(tags)
      .set(set)
      .where(and(eq(tags.id, tagId), eq(tags.userId, userId)));
  });
}

/**
 * タグ作成。名前正規化・色検証は呼び出し側で済ませる。
 * user×name の一意違反は未処理（PostgreSQL 23505 → 500）。
 */
export async function createTag(
  env: Bindings,
  userId: number,
  name: string,
  color: string,
): Promise<TagListItem> {
  return withDb(env, async (db) => {
    const rows = await db
      .insert(tags)
      .values({
        userId,
        name,
        color,
        createdAt: sql`CURRENT_TIMESTAMP`,
      })
      .returning({
        id: tags.id,
        name: tags.name,
        color: tags.color,
        created_at: tags.createdAt,
      });
    const r = rows[0];
    return {
      id: Number(r.id),
      name: r.name,
      color: r.color,
      created_at: toUtcIso(r.created_at)!,
      video_count: 0,
    };
  });
}

/** タグ削除（所有権を先に確認し、tx で video_tags → tags を削除）。 */
export async function deleteTag(
  env: Bindings,
  tagId: number,
  userId: number,
): Promise<{ notFound: true } | { ok: true }> {
  return withDb(env, async (db) => {
    return db.transaction(async (tx) => {
      const owner = await tx
        .select({ id: tags.id })
        .from(tags)
        .where(and(eq(tags.id, tagId), eq(tags.userId, userId)))
        .for("update")
        .limit(1);
      if (owner.length === 0) return { notFound: true } as const;

      await tx.delete(videoTags).where(eq(videoTags.tagId, tagId));
      await tx
        .delete(tags)
        .where(and(eq(tags.id, tagId), eq(tags.userId, userId)));
      return { ok: true } as const;
    });
  });
}
