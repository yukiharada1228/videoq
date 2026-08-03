import { alias } from "drizzle-orm/pg-core";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { withDb } from "../db/pool";
import { appTag, appVideo, appVideotag } from "../db/schema";
import { APP_TIMEZONE, normalizeDrfDatetime } from "../utils/datetime";
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

// TagListSerializer に一致する形。
export type TagListItem = {
  id: number;
  name: string;
  color: string;
  created_at: string;
  video_count: number;
};

// TagDetailSerializer に一致する形（TagList + ネスト videos）。
export type TagDetail = TagListItem & {
  videos: VideoListItem[];
};

const createdAtDrf = sql<string>`to_char(${appTag.createdAt}, 'YYYY-MM-DD"T"HH24:MI:SS.USOF')`.as(
  "created_at",
);

const videoCountSubquery = sql<number>`(SELECT count(*) FROM app_videotag vt WHERE vt.tag_id = ${appTag.id})::int`.as(
  "video_count",
);

const tagListSelect = {
  id: appTag.id,
  name: appTag.name,
  color: appTag.color,
  created_at: createdAtDrf,
  video_count: videoCountSubquery,
};

const v = alias(appVideo, "v");

const uploadedAtDrf = sql<string>`to_char(${v.uploadedAt}, 'YYYY-MM-DD"T"HH24:MI:SS.USOF')`.as(
  "uploaded_at",
);

/**
 * タグ一覧（ページ）。Tag.Meta.ordering=["name"] に従い name ASC。
 * video_count = Count("video_tags")（= app_videotag の該当行数）。
 * Django は全件シリアライズ後に StandardLimitOffsetPagination で切るため、
 * count は総数・results はページ。SQL の count + LIMIT/OFFSET と等価。
 */
export async function listTagsPage(
  env: Bindings,
  userId: number,
  limit: number,
  offset: number,
): Promise<{ count: number; results: TagListItem[] }> {
  return withDb(env, async (db) => {
    await db.execute(sql.raw(`SET timezone = '${APP_TIMEZONE}'`));

    const [countRow] = await db
      .select({ c: count() })
      .from(appTag)
      .where(eq(appTag.userId, userId));

    const rows = await db
      .select(tagListSelect)
      .from(appTag)
      .where(eq(appTag.userId, userId))
      .orderBy(asc(appTag.name))
      .limit(limit)
      .offset(offset);

    const results: TagListItem[] = rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      color: r.color,
      created_at: normalizeDrfDatetime(r.created_at),
      video_count: r.video_count,
    }));
    return { count: Number(countRow.c), results };
  });
}

/**
 * タグ詳細（get_with_videos 相当）。未所有/不在は null。
 * videos は該当 VideoTag の動画を VideoListSerializer 相当で返す。
 * Django の video_tags 既定順は ["tag__name"]（この文脈では定数）のため、
 * 安定な挿入順として vt.id ASC を用いる。
 */
export async function getTagDetail(
  env: Bindings,
  tagId: number,
  userId: number,
): Promise<TagDetail | null> {
  const data = await withDb(env, async (db) => {
    await db.execute(sql.raw(`SET timezone = '${APP_TIMEZONE}'`));

    const tagRows = await db
      .select(tagListSelect)
      .from(appTag)
      .where(and(eq(appTag.id, tagId), eq(appTag.userId, userId)))
      .limit(1);
    if (tagRows.length === 0) return null;

    const videoRows = await db
      .select({
        id: v.id,
        file: v.file,
        title: v.title,
        description: v.description,
        uploaded_at: uploadedAtDrf,
        status: v.status,
        source_type: v.sourceType,
        source_url: v.sourceUrl,
        youtube_video_id: v.youtubeVideoId,
        tags: sql<string>`${sql.raw(TAGS_SUBQUERY)}`.as("tags"),
      })
      .from(appVideotag)
      .innerJoin(v, eq(appVideotag.videoId, v.id))
      .where(eq(appVideotag.tagId, tagId))
      .orderBy(asc(appVideotag.id));

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
    created_at: normalizeDrfDatetime(t.created_at),
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
      .from(appTag)
      .where(and(eq(appTag.id, tagId), eq(appTag.userId, userId)))
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
      .update(appTag)
      .set(set)
      .where(and(eq(appTag.id, tagId), eq(appTag.userId, userId)));
  });
}

/**
 * タグ作成。名前正規化・色検証は呼び出し側で済ませる。
 * user×name の一意違反は未処理（pg 23505 → 500, 現行 Django と同じ）。
 */
export async function createTag(
  env: Bindings,
  userId: number,
  name: string,
  color: string,
): Promise<TagListItem> {
  return withDb(env, async (db) => {
    await db.execute(sql.raw(`SET timezone = '${APP_TIMEZONE}'`));
    const rows = await db
      .insert(appTag)
      .values({
        userId,
        name,
        color,
        createdAt: sql`CURRENT_TIMESTAMP`,
      })
      .returning({
        id: appTag.id,
        name: appTag.name,
        color: appTag.color,
        created_at: createdAtDrf,
      });
    const r = rows[0];
    return {
      id: Number(r.id),
      name: r.name,
      color: r.color,
      created_at: normalizeDrfDatetime(r.created_at),
      video_count: 0,
    };
  });
}

/** タグ削除（所有権を先に確認し、tx で app_videotag → app_tag を削除）。 */
export async function deleteTag(
  env: Bindings,
  tagId: number,
  userId: number,
): Promise<{ notFound: true } | { ok: true }> {
  return withDb(env, async (db) => {
    return db.transaction(async (tx) => {
      const owner = await tx
        .select({ id: appTag.id })
        .from(appTag)
        .where(and(eq(appTag.id, tagId), eq(appTag.userId, userId)))
        .for("update")
        .limit(1);
      if (owner.length === 0) return { notFound: true } as const;

      await tx.delete(appVideotag).where(eq(appVideotag.tagId, tagId));
      await tx
        .delete(appTag)
        .where(and(eq(appTag.id, tagId), eq(appTag.userId, userId)));
      return { ok: true } as const;
    });
  });
}
