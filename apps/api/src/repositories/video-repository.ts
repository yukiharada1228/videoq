import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { withDb } from "../db/pool";
import { sqlNumberArray } from "../db/sql-array";
import {
  plogBuildJobs,
  plogConcepts,
  plogEdges,
  plogSummaryNodes,
  videos,
  videoGroupMembers,
  videoTags,
} from "../db/schema";
import { toUtcIso } from "../shared/datetime";
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
  user: string;
  transcript: string | null;
  error_message: string | null;
};

export type VideoListCriteria = {
  keyword: string; // q
  statusFilter: string; // カンマ区切り
  sortKey: string; // ordering
  tagIds: number[] | null;
};

// 許可済みの並び順。マップ外（空を含む）は -uploaded_at。
const ORDER_MAP: Record<string, SQL> = {
  uploaded_at_desc: desc(videos.uploadedAt),
  uploaded_at_asc: asc(videos.uploadedAt),
  title_asc: asc(videos.title),
  title_desc: desc(videos.title),
};

// 部分一致検索用に LIKE 特殊文字をエスケープする（ESCAPE '\'）。
function escapeLike(value: string): string {
  return value.replace(/([\\%_])/g, "\\$1");
}


// Correlate with outer videos explicitly — ${videos.id} emits bare "id"
// which is ambiguous once the subquery joins tags (also has id).
const videoTagsJson = sql<string>`COALESCE((
  SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color) ORDER BY t.name)
  FROM video_tags vt JOIN tags t ON t.id = vt.tag_id
  WHERE vt.video_id = "videos"."id"
), '[]'::json)::text`.as("tags");

/** WHERE 条件を Drizzle 式で組み立てる。 */
function buildFilterConditions(userId: string, c: VideoListCriteria): SQL {
  const conditions: SQL[] = [eq(videos.userId, userId)];

  if (c.keyword) {
    const pattern = `%${escapeLike(c.keyword)}%`;
    conditions.push(
      or(ilike(videos.title, pattern), ilike(videos.description, pattern))!,
    );
  }

  const statuses = c.statusFilter
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (statuses.length === 1) {
    conditions.push(eq(videos.status, statuses[0]));
  } else if (statuses.length > 1) {
    conditions.push(inArray(videos.status, statuses));
  }

  if (c.tagIds && c.tagIds.length > 0) {
    conditions.push(
      inArray(
        videos.id,
        sql`(SELECT vt.video_id FROM video_tags vt WHERE vt.tag_id = ANY(${sqlNumberArray(c.tagIds)}))`,
      ),
    );
  }

  return and(...conditions)!;
}

export const TAGS_SUBQUERY = `COALESCE((
  SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color) ORDER BY t.name)
  FROM video_tags vt JOIN tags t ON t.id = vt.tag_id
  WHERE vt.video_id = v.id
), '[]'::json)::text`;

// 動画一覧の行→オブジェクト変換（一覧・詳細・グループ詳細で共有）。
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
    uploaded_at: toUtcIso(r.uploaded_at as string)!,
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
  userId: string,
): Promise<VideoDetail | null> {
  const row = await withDb(env, async (db) => {
    const rows = await db
      .select({
        id: videos.id,
        user_id: videos.userId,
        file: videos.file,
        title: videos.title,
        description: videos.description,
        uploaded_at: videos.uploadedAt,
        transcript: videos.transcript,
        status: videos.status,
        source_type: videos.sourceType,
        source_url: videos.sourceUrl,
        youtube_video_id: videos.youtubeVideoId,
        error_message: videos.errorMessage,
        tags: videoTagsJson,
      })
      .from(videos)
      .where(and(eq(videos.id, videoId), eq(videos.userId, userId)))
      .limit(1);
    return rows[0] ?? null;
  });
  if (!row) return null;

  const youtubeId = row.youtube_video_id || null;
  return {
    id: Number(row.id),
    user: String(row.user_id),
    file: await resolveFileUrl(env, row.file || null),
    title: row.title,
    description: row.description,
    uploaded_at: toUtcIso(row.uploaded_at)!,
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
 * 動画メタデータを更新する（title/description のみ）。
 * 提供フィールドのみ動的 SET（Video に updated_at は無い）。title 変更の有無を返す
 * （呼び出し側で PGVector メタ同期を best-effort 実行する）。
 */
export async function updateVideo(
  env: Bindings,
  videoId: number,
  userId: string,
  fields: { title?: string; description?: string; transcript?: string },
): Promise<
  | { notFound: true }
  | { ok: true; titleChanged: boolean; newTitle: string | null; transcriptChanged: boolean }
> {
  return withDb(env, async (db) => {
    const cur = await db
      .select({ title: videos.title, transcript: videos.transcript })
      .from(videos)
      .where(and(eq(videos.id, videoId), eq(videos.userId, userId)))
      .limit(1);
    if (cur.length === 0) return { notFound: true } as const;
    const oldTitle = cur[0].title;
    const oldTranscript = cur[0].transcript ?? "";

    const patch: { title?: string; description?: string; transcript?: string } = {};
    if (fields.title !== undefined) patch.title = fields.title;
    if (fields.description !== undefined) patch.description = fields.description;
    if (fields.transcript !== undefined) patch.transcript = fields.transcript;
    if (Object.keys(patch).length > 0) {
      await db
        .update(videos)
        .set(patch)
        .where(and(eq(videos.id, videoId), eq(videos.userId, userId)));
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
 * YouTube 動画レコードを作成する。
 * source_type='youtube', status='pending', file=''。作成した id を返す。
 */
export async function createYoutubeVideo(
  env: Bindings,
  userId: string,
  params: { sourceUrl: string; youtubeVideoId: string; title: string; description: string },
): Promise<number> {
  return withDb(env, async (db) => {
    const rows = await db
      .insert(videos)
      .values({
        userId,
        file: "",
        title: params.title,
        description: params.description,
        status: "pending",
        sourceType: "youtube",
        sourceUrl: params.sourceUrl,
        youtubeVideoId: params.youtubeVideoId,
        transcript: "",
        errorMessage: "",
        uploadedAt: sql`CURRENT_TIMESTAMP`,
      })
      .returning({ id: videos.id });
    return Number(rows[0].id);
  });
}

/** 動画の存在 + transcript の有無（plog rebuild の 404 判定用）。 */
export async function getVideoTranscriptState(
  env: Bindings,
  videoId: number,
  userId: string,
): Promise<{ found: false } | { found: true; hasTranscript: boolean }> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ transcript: videos.transcript })
      .from(videos)
      .where(and(eq(videos.id, videoId), eq(videos.userId, userId)))
      .limit(1);
    if (rows.length === 0) return { found: false } as const;
    const t = rows[0].transcript;
    return { found: true, hasTranscript: !!t && t !== "" } as const;
  });
}

/** 動画の status を取得（存在確認込み。未所有/不在は found:false）。 */
export async function getVideoStatus(
  env: Bindings,
  videoId: number,
  userId: string,
): Promise<{ found: false } | { found: true; status: string }> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ status: videos.status })
      .from(videos)
      .where(and(eq(videos.id, videoId), eq(videos.userId, userId)))
      .limit(1);
    if (rows.length === 0) return { found: false } as const;
    return { found: true, status: rows[0].status } as const;
  });
}

/**
 * status を条件付き遷移する。from 状態のときのみ to へ進める。
 * error_message は "" にリセット。更新行があれば true。
 */
export async function transitionVideoStatus(
  env: Bindings,
  videoId: number,
  fromStatus: string,
  toStatus: string,
): Promise<boolean> {
  return withDb(env, async (db) => {
    const rows = await db
      .update(videos)
      .set({ status: toStatus, errorMessage: "" })
      .where(and(eq(videos.id, videoId), eq(videos.status, fromStatus)))
      .returning({ id: videos.id });
    return rows.length > 0;
  });
}

/** status=uploading のまま放置された動画（FR-Q3 放棄解放用）。 */
export type StaleUploadingVideo = {
  id: number;
  userId: string;
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
  return withDb(env, async (db) => {
    const rows = await db
      .select({
        id: videos.id,
        userId: videos.userId,
        file: videos.file,
      })
      .from(videos)
      .where(
        and(
          eq(videos.status, "uploading"),
          sql`${videos.uploadedAt} < NOW() - (${olderThanHours}::double precision * INTERVAL '1 hour')`,
        ),
      )
      .orderBy(asc(videos.uploadedAt))
      .limit(limit);
    return rows.map((r) => ({
      id: Number(r.id),
      userId: String(r.userId),
      fileKey: r.file || null,
    }));
  });
}

/**
 * アップロード保留の動画レコードを作成する。
 * status='uploading'、source_type は既定 'uploaded'、uploaded_at=CURRENT_TIMESTAMP。
 * 作成した id を返す。
 */
export async function createPendingVideo(
  env: Bindings,
  userId: string,
  fileKey: string,
  title: string,
  description: string,
): Promise<number> {
  return withDb(env, async (db) => {
    const rows = await db
      .insert(videos)
      .values({
        userId,
        file: fileKey,
        title,
        description,
        status: "uploading",
        sourceType: "uploaded",
        sourceUrl: "",
        youtubeVideoId: "",
        transcript: "",
        errorMessage: "",
        uploadedAt: sql`CURRENT_TIMESTAMP`,
      })
      .returning({ id: videos.id });
    return Number(rows[0].id);
  });
}

/**
 * ローカル multipart アップロード完了後の動画を作成する。
 * ファイルは既に VIDEO_BUCKET にあり、status='pending' で transcription 待ち。
 */
export async function createUploadedVideo(
  env: Bindings,
  userId: string,
  fileKey: string,
  title: string,
  description: string,
): Promise<number> {
  return withDb(env, async (db) => {
    const rows = await db
      .insert(videos)
      .values({
        userId,
        file: fileKey,
        title,
        description,
        status: "pending",
        sourceType: "uploaded",
        sourceUrl: "",
        youtubeVideoId: "",
        transcript: "",
        errorMessage: "",
        uploadedAt: sql`CURRENT_TIMESTAMP`,
      })
      .returning({ id: videos.id });
    return Number(rows[0].id);
  });
}

/** 削除前に file_key と存在を取得（file 空文字/NULL は null）。 */
export async function getVideoFileKey(
  env: Bindings,
  videoId: number,
  userId: string,
): Promise<{ found: false } | { found: true; fileKey: string | null }> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ file: videos.file })
      .from(videos)
      .where(and(eq(videos.id, videoId), eq(videos.userId, userId)))
      .limit(1);
    if (rows.length === 0) return { found: false } as const;
    return { found: true, fileKey: rows[0].file || null };
  });
}

/**
 * 動画と関連行をトランザクション内でハード削除する。
 * DB 側 FK は ON DELETE CASCADE を持たないため、
 * 子テーブルを依存順に明示削除する。存在確認は呼び出し側で済ませる前提。
 *
 * 依存グラフ: video → {videotag, videogroupmember, plogbuildjob, plogsummarynode(self),
 *   plogconcept → {learnerconceptstate, ploglearningobject, plogedge}}
 *   （plogedge は video_id と concept(source/target) の双方を参照）。
 */
export async function deleteVideoCascade(
  env: Bindings,
  videoId: number,
  userId: string,
): Promise<boolean> {
  return withDb(env, async (db) => {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM videos WHERE id = ${videoId} FOR UPDATE`);

      await tx.execute(sql`
        DELETE FROM learner_concept_states
         WHERE concept_id IN (SELECT id FROM plog_concepts WHERE video_id = ${videoId})
      `);
      await tx.execute(sql`
        DELETE FROM plog_learning_objects
         WHERE concept_id IN (SELECT id FROM plog_concepts WHERE video_id = ${videoId})
      `);
      await tx.delete(plogEdges).where(eq(plogEdges.videoId, videoId));
      await tx.delete(plogConcepts).where(eq(plogConcepts.videoId, videoId));

      await tx.delete(plogSummaryNodes).where(eq(plogSummaryNodes.videoId, videoId));
      await tx.delete(plogBuildJobs).where(eq(plogBuildJobs.videoId, videoId));
      await tx.delete(videoTags).where(eq(videoTags.videoId, videoId));
      await tx.delete(videoGroupMembers).where(eq(videoGroupMembers.videoId, videoId));
      // No FK; remove vector rows so orphan embeddings do not linger.
      await tx.execute(sql`DELETE FROM scene_embeddings WHERE video_id = ${videoId}`);

      const deleted = await tx
        .delete(videos)
        .where(and(eq(videos.id, videoId), eq(videos.userId, userId)))
        .returning({ id: videos.id });
      return deleted.length > 0;
    });
  });
}

export async function listVideosPage(
  env: Bindings,
  userId: string,
  criteria: VideoListCriteria,
  limit: number,
  offset: number,
): Promise<{ count: number; results: VideoListItem[] }> {
  const where = buildFilterConditions(userId, criteria);
  const orderBy = ORDER_MAP[criteria.sortKey] ?? desc(videos.uploadedAt);

  const { rows, count } = await withDb(env, async (db) => {
    const countRows = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(videos)
      .where(where);

    const listRows = await db
      .select({
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
      .from(videos)
      .where(where)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    return { rows: listRows, count: countRows[0].c };
  });

  const results: VideoListItem[] = await Promise.all(
    rows.map((r) => mapVideoListRow(env, r)),
  );

  return { count, results };
}
