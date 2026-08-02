import { withDb } from "../db/pool";
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
  const row = await withDb(env, async (db, client) => {
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

/**
 * 動画メタ更新（title/description のみ）。UpdateVideoUseCase 相当。
 * 提供フィールドのみ動的 SET（Video に updated_at は無い）。title 変更の有無を返す
 * （呼び出し側で PGVector メタ同期を best-effort 実行する）。
 */
export async function updateVideo(
  env: Bindings,
  videoId: number,
  userId: number,
  fields: { title?: string; description?: string; transcript?: string },
): Promise<
  | { notFound: true }
  | { ok: true; titleChanged: boolean; newTitle: string | null; transcriptChanged: boolean }
> {
  return withDb(env, async (db, client) => {
    const cur = await client.query(
      `SELECT title, transcript FROM app_video WHERE id = $1 AND user_id = $2`,
      [videoId, userId],
    );
    if (cur.rowCount === 0) return { notFound: true } as const;
    const oldTitle = cur.rows[0].title as string;
    const oldTranscript = (cur.rows[0].transcript ?? "") as string; // video.transcript or ""

    const sets: string[] = [];
    const params: unknown[] = [videoId, userId];
    if (fields.title !== undefined) {
      params.push(fields.title);
      sets.push(`title = $${params.length}`);
    }
    if (fields.description !== undefined) {
      params.push(fields.description);
      sets.push(`description = $${params.length}`);
    }
    if (fields.transcript !== undefined) {
      params.push(fields.transcript);
      sets.push(`transcript = $${params.length}`);
    }
    if (sets.length > 0) {
      await client.query(
        `UPDATE app_video SET ${sets.join(", ")} WHERE id = $1 AND user_id = $2`,
        params,
      );
    }

    return {
      ok: true,
      titleChanged: fields.title !== undefined && fields.title !== oldTitle,
      newTitle: fields.title ?? null,
      transcriptChanged: fields.transcript !== undefined && fields.transcript !== oldTranscript,
    } as const;
  });
}

/**
 * YouTube 動画レコードを作成（create_youtube 相当）。
 * source_type='youtube', status='pending', file=''。作成した id を返す。
 */
export async function createYoutubeVideo(
  env: Bindings,
  userId: number,
  params: { sourceUrl: string; youtubeVideoId: string; title: string; description: string },
): Promise<number> {
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `INSERT INTO app_video
         (user_id, file, title, description, status, source_type, source_url,
          youtube_video_id, transcript, error_message, uploaded_at)
       VALUES ($1, '', $2, $3, 'pending', 'youtube', $4, $5, '', '', CURRENT_TIMESTAMP)
       RETURNING id`,
      [userId, params.title, params.description, params.sourceUrl, params.youtubeVideoId],
    );
    return Number(rows[0].id);
  });
}

/** 動画の存在 + transcript の有無（plog rebuild の 404 判定用）。 */
export async function getVideoTranscriptState(
  env: Bindings,
  videoId: number,
  userId: number,
): Promise<{ found: false } | { found: true; hasTranscript: boolean }> {
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT transcript FROM app_video WHERE id = $1 AND user_id = $2`,
      [videoId, userId],
    );
    if (rows.length === 0) return { found: false } as const;
    const t = rows[0].transcript;
    return { found: true, hasTranscript: !!t && t !== "" } as const;
  });
}

/** 動画の status を取得（存在確認込み。未所有/不在は found:false）。 */
export async function getVideoStatus(
  env: Bindings,
  videoId: number,
  userId: number,
): Promise<{ found: false } | { found: true; status: string }> {
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT status FROM app_video WHERE id = $1 AND user_id = $2`,
      [videoId, userId],
    );
    if (rows.length === 0) return { found: false } as const;
    return { found: true, status: rows[0].status as string } as const;
  });
}

/**
 * status を条件付き遷移（transition_status 相当）。from 状態のときのみ to へ。
 * error_message は "" にリセット。更新行があれば true。
 */
export async function transitionVideoStatus(
  env: Bindings,
  videoId: number,
  fromStatus: string,
  toStatus: string,
): Promise<boolean> {
  return withDb(env, async (db, client) => {
    const res = await client.query(
      `UPDATE app_video SET status = $3, error_message = ''
        WHERE id = $1 AND status = $2`,
      [videoId, fromStatus, toStatus],
    );
    return (res.rowCount ?? 0) > 0;
  });
}

/** status=uploading のまま放置された動画（FR-Q3 放棄解放用）。 */
export type StaleUploadingVideo = {
  id: number;
  userId: number;
  fileKey: string | null;
};

/**
 * 署名 URL 期限（1h）を超えても uploading のままの行を取得。
 * `olderThanHours` 未満は対象外。バッチ上限で cron 実行時間を抑える。
 */
export async function listStaleUploadingVideos(
  env: Bindings,
  olderThanHours: number,
  limit = 100,
): Promise<StaleUploadingVideo[]> {
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT id, user_id, file
         FROM app_video
        WHERE status = 'uploading'
          AND uploaded_at < NOW() - ($1::double precision * INTERVAL '1 hour')
        ORDER BY uploaded_at ASC
        LIMIT $2`,
      [olderThanHours, limit],
    );
    return rows.map((r) => ({
      id: Number(r.id),
      userId: Number(r.user_id),
      fileKey: (r.file || null) as string | null,
    }));
  });
}

/**
 * アップロード保留の動画レコードを作成（create_pending 相当）。
 * status='uploading'、source_type は既定 'uploaded'、uploaded_at=CURRENT_TIMESTAMP。
 * 作成した id を返す。
 */
export async function createPendingVideo(
  env: Bindings,
  userId: number,
  fileKey: string,
  title: string,
  description: string,
): Promise<number> {
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `INSERT INTO app_video
         (user_id, file, title, description, status, source_type, source_url,
          youtube_video_id, transcript, error_message, uploaded_at)
       VALUES ($1, $2, $3, $4, 'uploading', 'uploaded', '', '', '', '', CURRENT_TIMESTAMP)
       RETURNING id`,
      [userId, fileKey, title, description],
    );
    return Number(rows[0].id);
  });
}

/**
 * ローカル multipart アップロード完了後の動画作成（CreateVideoUseCase / repo.create 相当）。
 * ファイルは既に VIDEO_BUCKET にあり、status='pending' で transcription 待ち。
 */
export async function createUploadedVideo(
  env: Bindings,
  userId: number,
  fileKey: string,
  title: string,
  description: string,
): Promise<number> {
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `INSERT INTO app_video
         (user_id, file, title, description, status, source_type, source_url,
          youtube_video_id, transcript, error_message, uploaded_at)
       VALUES ($1, $2, $3, $4, 'pending', 'uploaded', '', '', '', '', CURRENT_TIMESTAMP)
       RETURNING id`,
      [userId, fileKey, title, description],
    );
    return Number(rows[0].id);
  });
}

/** 削除前に file_key と存在を取得（file 空文字/NULL は null）。 */
export async function getVideoFileKey(
  env: Bindings,
  videoId: number,
  userId: number,
): Promise<{ found: false } | { found: true; fileKey: string | null }> {
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT file FROM app_video WHERE id = $1 AND user_id = $2`,
      [videoId, userId],
    );
    if (rows.length === 0) return { found: false } as const;
    return { found: true, fileKey: (rows[0].file || null) as string | null };
  });
}

/**
 * 動画のハード削除（Django ORM の cascade をトランザクションで再現）。
 * DB 側 FK は ON DELETE CASCADE を持たない（Django が Python 側でエミュレート）ため、
 * 子テーブルを依存順に明示削除する。存在確認は呼び出し側で済ませる前提。
 *
 * 依存グラフ: video → {videotag, videogroupmember, plogbuildjob, plogsummarynode(self),
 *   plogconcept → {learnerconceptstate, ploglearningobject, plogedge}}
 *   （plogedge は video_id と concept(source/target) の双方を参照）。
 */
export async function deleteVideoCascade(
  env: Bindings,
  videoId: number,
  userId: number,
): Promise<void> {
  return withDb(env, async (db, client) => {
    await client.query("BEGIN");
    try {
      await client.query(`SELECT 1 FROM app_video WHERE id = $1 FOR UPDATE`, [videoId]);

      // concept の子（learner state / learning object）→ concept を参照する edge → concept
      await client.query(
        `DELETE FROM app_learnerconceptstate
          WHERE concept_id IN (SELECT id FROM app_plogconcept WHERE video_id = $1)`,
        [videoId],
      );
      await client.query(
        `DELETE FROM app_ploglearningobject
          WHERE concept_id IN (SELECT id FROM app_plogconcept WHERE video_id = $1)`,
        [videoId],
      );
      await client.query(`DELETE FROM app_plogedge WHERE video_id = $1`, [videoId]);
      await client.query(`DELETE FROM app_plogconcept WHERE video_id = $1`, [videoId]);

      // video 直下の残り（summarynode は self-FK だが全行 video_id を持つため一括で可）
      await client.query(`DELETE FROM app_plogsummarynode WHERE video_id = $1`, [videoId]);
      await client.query(`DELETE FROM app_plogbuildjob WHERE video_id = $1`, [videoId]);
      await client.query(`DELETE FROM app_videotag WHERE video_id = $1`, [videoId]);
      await client.query(`DELETE FROM app_videogroupmember WHERE video_id = $1`, [videoId]);

      await client.query(
        `DELETE FROM app_video WHERE id = $1 AND user_id = $2`,
        [videoId, userId],
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
}

export async function listVideosPage(
  env: Bindings,
  userId: number,
  criteria: VideoListCriteria,
  limit: number,
  offset: number,
): Promise<{ count: number; results: VideoListItem[] }> {
  const { rows, count } = await withDb(env, async (db, client) => {
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
    rows.map((r) => mapVideoListRow(env, r)),
  );

  return { count, results };
}
