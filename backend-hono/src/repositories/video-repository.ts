import { withClient } from "../db/pool";
import { APP_TIMEZONE, normalizeDrfDatetime } from "../utils/datetime";
import { resolveFileUrl } from "../integrations/media";
import type { Bindings } from "../types/bindings";

export type VideoListItem = {
  id: number;
  file: string | null;
  title: string;
  description: string;
  uploaded_at: string;
  status: string;
  source_type: string;
  source_url: string | null;
  youtube_video_id: string | null;
  youtube_embed_url: string | null;
  tags: { id: number; name: string; color: string }[];
};

// VideoSerializer（詳細）: 一覧 + user / transcript / error_message
export type VideoDetail = VideoListItem & {
  user: number;
  transcript: string | null;
  error_message: string | null;
};

export type VideoListCriteria = {
  keyword: string; // q
  statusFilter: string; // カンマ区切り
  sortKey: string; // ordering
  tagIds: number[] | null;
};

// Django ordering_map。マップ外（空含む）は Meta.ordering = -uploaded_at。
const ORDER_MAP: Record<string, string> = {
  uploaded_at_desc: "v.uploaded_at DESC",
  uploaded_at_asc: "v.uploaded_at ASC",
  title_asc: "v.title ASC",
  title_desc: "v.title DESC",
};

// LIKE 特殊文字をエスケープ（Django icontains 相当。既定 ESCAPE '\'）。
function escapeLike(value: string): string {
  return value.replace(/([\\%_])/g, "\\$1");
}

/** WHERE 句とパラメータを組み立てる（$1 は user_id 固定）。 */
function buildFilters(userId: number, c: VideoListCriteria) {
  const where: string[] = ["v.user_id = $1"];
  const params: unknown[] = [userId];

  if (c.keyword) {
    params.push(`%${escapeLike(c.keyword)}%`);
    where.push(`(v.title ILIKE $${params.length} OR v.description ILIKE $${params.length})`);
  }

  const statuses = c.statusFilter
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (statuses.length === 1) {
    params.push(statuses[0]);
    where.push(`v.status = $${params.length}`);
  } else if (statuses.length > 1) {
    params.push(statuses);
    where.push(`v.status = ANY($${params.length}::text[])`);
  }

  if (c.tagIds && c.tagIds.length > 0) {
    params.push(c.tagIds);
    where.push(
      `v.id IN (SELECT vt.video_id FROM app_videotag vt WHERE vt.tag_id = ANY($${params.length}::int[]))`,
    );
  }

  return { whereSql: where.join(" AND "), params };
}

export const TAGS_SUBQUERY = `COALESCE((
  SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color) ORDER BY t.name)
  FROM app_videotag vt JOIN app_tag t ON t.id = vt.tag_id
  WHERE vt.video_id = v.id
), '[]'::json)::text`;

// VideoListSerializer 相当の行→オブジェクト変換（一覧・詳細・グループ詳細で共有）。
// 行は少なくとも id/file/title/description/uploaded_at(to_char済)/status/source_type/
// source_url/youtube_video_id/tags(::text) を含むこと。
export async function mapVideoListRow(
  env: Bindings,
  r: Record<string, unknown>,
): Promise<VideoListItem> {
  const youtubeId = (r.youtube_video_id as string) || null;
  return {
    id: Number(r.id),
    file: await resolveFileUrl(env, (r.file as string) || null),
    title: r.title as string,
    description: r.description as string,
    uploaded_at: normalizeDrfDatetime(r.uploaded_at as string),
    status: r.status as string,
    source_type: r.source_type as string,
    source_url: (r.source_url as string) || null,
    youtube_video_id: youtubeId,
    youtube_embed_url: youtubeId
      ? `https://www.youtube.com/embed/${youtubeId}`
      : null,
    tags: JSON.parse(r.tags as string),
  };
}

/** VideoDetailView: id + user_id で1件取得（未所有/不在は null）。 */
export async function getVideoDetail(
  env: Bindings,
  videoId: number,
  userId: number,
): Promise<VideoDetail | null> {
  const row = await withClient(env, async (client) => {
    await client.query(`SET timezone = '${APP_TIMEZONE}'`);
    const { rows } = await client.query(
      `SELECT v.id, v.user_id, v.file, v.title, v.description,
              to_char(v.uploaded_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF') AS uploaded_at,
              v.transcript, v.status, v.source_type, v.source_url, v.youtube_video_id,
              v.error_message, ${TAGS_SUBQUERY} AS tags
         FROM app_video v
        WHERE v.id = $1 AND v.user_id = $2`,
      [videoId, userId],
    );
    return rows[0] ?? null;
  });
  if (!row) return null;

  const youtubeId = row.youtube_video_id || null;
  return {
    id: Number(row.id),
    user: Number(row.user_id),
    file: await resolveFileUrl(env, row.file || null),
    title: row.title,
    description: row.description,
    uploaded_at: normalizeDrfDatetime(row.uploaded_at),
    transcript: row.transcript || null,
    status: row.status,
    source_type: row.source_type,
    source_url: row.source_url || null,
    youtube_video_id: youtubeId,
    youtube_embed_url: youtubeId
      ? `https://www.youtube.com/embed/${youtubeId}`
      : null,
    error_message: row.error_message || null,
    tags: JSON.parse(row.tags),
  };
}

export async function listVideosPage(
  env: Bindings,
  userId: number,
  criteria: VideoListCriteria,
  limit: number,
  offset: number,
): Promise<{ count: number; results: VideoListItem[] }> {
  const { rows, count } = await withClient(env, async (client) => {
    await client.query(`SET timezone = '${APP_TIMEZONE}'`);
    const { whereSql, params } = buildFilters(userId, criteria);

    const countRes = await client.query(
      `SELECT count(*)::int AS c FROM app_video v WHERE ${whereSql}`,
      params,
    );

    const orderBy = ORDER_MAP[criteria.sortKey] ?? "v.uploaded_at DESC";
    const pageParams = [...params, limit, offset];
    const listRes = await client.query(
      `SELECT v.id, v.file, v.title, v.description,
              to_char(v.uploaded_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF') AS uploaded_at,
              v.status, v.source_type, v.source_url, v.youtube_video_id,
              COALESCE((
                SELECT json_agg(
                         json_build_object('id', t.id, 'name', t.name, 'color', t.color)
                         ORDER BY t.name)
                FROM app_videotag vt JOIN app_tag t ON t.id = vt.tag_id
                WHERE vt.video_id = v.id
              ), '[]'::json)::text AS tags
         FROM app_video v
        WHERE ${whereSql}
        ORDER BY ${orderBy}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      pageParams,
    );
    return { rows: listRes.rows, count: countRes.rows[0].c };
  });

  const results: VideoListItem[] = await Promise.all(
    rows.map(async (r) => {
      const youtubeId = r.youtube_video_id || null;
      return {
        id: Number(r.id),
        file: await resolveFileUrl(env, r.file || null),
        title: r.title,
        description: r.description,
        uploaded_at: normalizeDrfDatetime(r.uploaded_at),
        status: r.status,
        source_type: r.source_type,
        source_url: r.source_url || null,
        youtube_video_id: youtubeId,
        youtube_embed_url: youtubeId
          ? `https://www.youtube.com/embed/${youtubeId}`
          : null,
        // tags は ::text で受け取り JSON.parse（workerd の json 型パースを回避）
        tags: JSON.parse(r.tags),
      };
    }),
  );

  return { count, results };
}
