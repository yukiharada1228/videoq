import { withDb } from "../db/pool";
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
  return withDb(env, async (db, client) => {
    await client.query(`SET timezone = '${APP_TIMEZONE}'`);

    const countRes = await client.query(
      `SELECT count(*)::int AS c FROM app_tag WHERE user_id = $1`,
      [userId],
    );

    const { rows } = await client.query(
      `SELECT t.id, t.name, t.color,
              to_char(t.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF') AS created_at,
              (SELECT count(*) FROM app_videotag vt WHERE vt.tag_id = t.id)::int AS video_count
         FROM app_tag t
        WHERE t.user_id = $1
        ORDER BY t.name ASC
        LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );

    const results: TagListItem[] = rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      color: r.color,
      created_at: normalizeDrfDatetime(r.created_at),
      video_count: r.video_count,
    }));
    return { count: countRes.rows[0].c, results };
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
  const data = await withDb(env, async (db, client) => {
    await client.query(`SET timezone = '${APP_TIMEZONE}'`);

    const tagRes = await client.query(
      `SELECT t.id, t.name, t.color,
              to_char(t.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF') AS created_at,
              (SELECT count(*) FROM app_videotag vt WHERE vt.tag_id = t.id)::int AS video_count
         FROM app_tag t
        WHERE t.id = $1 AND t.user_id = $2`,
      [tagId, userId],
    );
    if (tagRes.rows.length === 0) return null;

    const videoRes = await client.query(
      `SELECT v.id, v.file, v.title, v.description,
              to_char(v.uploaded_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF') AS uploaded_at,
              v.status, v.source_type, v.source_url, v.youtube_video_id,
              ${TAGS_SUBQUERY} AS tags
         FROM app_videotag vt
         JOIN app_video v ON v.id = vt.video_id
        WHERE vt.tag_id = $1
        ORDER BY vt.id ASC`,
      [tagId],
    );
    return { tag: tagRes.rows[0], videoRows: videoRes.rows };
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
  return withDb(env, async (db, client) => {
    const res = await client.query(
      `SELECT 1 FROM app_tag WHERE id = $1 AND user_id = $2`,
      [tagId, userId],
    );
    return res.rowCount! > 0;
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
  return withDb(env, async (db, client) => {
    const sets: string[] = [];
    const params: unknown[] = [tagId, userId];
    if (fields.name !== undefined) {
      params.push(fields.name);
      sets.push(`name = $${params.length}`);
    }
    if (fields.color !== undefined) {
      params.push(fields.color);
      sets.push(`color = $${params.length}`);
    }
    if (sets.length > 0) {
      await client.query(
        `UPDATE app_tag SET ${sets.join(", ")} WHERE id = $1 AND user_id = $2`,
        params,
      );
    }
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
  return withDb(env, async (db, client) => {
    await client.query(`SET timezone = '${APP_TIMEZONE}'`);
    const { rows } = await client.query(
      `INSERT INTO app_tag (user_id, name, color, created_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       RETURNING id, name, color,
                 to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF') AS created_at`,
      [userId, name, color],
    );
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
  return withDb(env, async (db, client) => {
    await client.query("BEGIN");
    try {
      const owner = await client.query(
        `SELECT id FROM app_tag WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [tagId, userId],
      );
      if (owner.rowCount === 0) {
        await client.query("ROLLBACK");
        return { notFound: true } as const;
      }
      await client.query(`DELETE FROM app_videotag WHERE tag_id = $1`, [tagId]);
      await client.query(
        `DELETE FROM app_tag WHERE id = $1 AND user_id = $2`,
        [tagId, userId],
      );
      await client.query("COMMIT");
      return { ok: true } as const;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
}
