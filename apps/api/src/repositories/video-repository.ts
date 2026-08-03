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
import {
  appPlogbuildjob,
  appPlogconcept,
  appPlogedge,
  appPlogsummarynode,
  appVideo,
  appVideogroupmember,
  appVideotag,
} from "../db/schema";
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
const ORDER_MAP: Record<string, SQL> = {
  uploaded_at_desc: desc(appVideo.uploadedAt),
  uploaded_at_asc: asc(appVideo.uploadedAt),
  title_asc: asc(appVideo.title),
  title_desc: desc(appVideo.title),
};

// LIKE 特殊文字をエスケープ（Django icontains 相当。既定 ESCAPE '\'）。
function escapeLike(value: string): string {
  return value.replace(/([\\%_])/g, "\\$1");
}

const uploadedAtDrf = sql<string>`to_char(${appVideo.uploadedAt}, 'YYYY-MM-DD"T"HH24:MI:SS.USOF')`.as(
  "uploaded_at",
);
// Correlate with outer app_video explicitly — ${appVideo.id} emits bare "id"
// which is ambiguous once the subquery joins app_tag (also has id).
const videoTagsJson = sql<string>`COALESCE((
  SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color) ORDER BY t.name)
  FROM app_videotag vt JOIN app_tag t ON t.id = vt.tag_id
  WHERE vt.video_id = "app_video"."id"
), '[]'::json)::text`.as("tags");

/** WHERE 条件を Drizzle 式で組み立てる。 */
function buildFilterConditions(userId: number, c: VideoListCriteria): SQL {
  const conditions: SQL[] = [eq(appVideo.userId, userId)];

  if (c.keyword) {
    const pattern = `%${escapeLike(c.keyword)}%`;
    conditions.push(
      or(ilike(appVideo.title, pattern), ilike(appVideo.description, pattern))!,
    );
  }

  const statuses = c.statusFilter
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (statuses.length === 1) {
    conditions.push(eq(appVideo.status, statuses[0]));
  } else if (statuses.length > 1) {
    conditions.push(inArray(appVideo.status, statuses));
  }

  if (c.tagIds && c.tagIds.length > 0) {
    conditions.push(
      inArray(
        appVideo.id,
        sql`(SELECT vt.video_id FROM app_videotag vt WHERE vt.tag_id = ANY(${c.tagIds}::int[]))`,
      ),
    );
  }

  return and(...conditions)!;
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
  const row = await withDb(env, async (db) => {
    await db.execute(sql.raw(`SET timezone = '${APP_TIMEZONE}'`));
    const rows = await db
      .select({
        id: appVideo.id,
        user_id: appVideo.userId,
        file: appVideo.file,
        title: appVideo.title,
        description: appVideo.description,
        uploaded_at: uploadedAtDrf,
        transcript: appVideo.transcript,
        status: appVideo.status,
        source_type: appVideo.sourceType,
        source_url: appVideo.sourceUrl,
        youtube_video_id: appVideo.youtubeVideoId,
        error_message: appVideo.errorMessage,
        tags: videoTagsJson,
      })
      .from(appVideo)
      .where(and(eq(appVideo.id, videoId), eq(appVideo.userId, userId)))
      .limit(1);
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
  return withDb(env, async (db) => {
    const cur = await db
      .select({ title: appVideo.title, transcript: appVideo.transcript })
      .from(appVideo)
      .where(and(eq(appVideo.id, videoId), eq(appVideo.userId, userId)))
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
        .update(appVideo)
        .set(patch)
        .where(and(eq(appVideo.id, videoId), eq(appVideo.userId, userId)));
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
  return withDb(env, async (db) => {
    const rows = await db
      .insert(appVideo)
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
      .returning({ id: appVideo.id });
    return Number(rows[0].id);
  });
}

/** 動画の存在 + transcript の有無（plog rebuild の 404 判定用）。 */
export async function getVideoTranscriptState(
  env: Bindings,
  videoId: number,
  userId: number,
): Promise<{ found: false } | { found: true; hasTranscript: boolean }> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ transcript: appVideo.transcript })
      .from(appVideo)
      .where(and(eq(appVideo.id, videoId), eq(appVideo.userId, userId)))
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
  userId: number,
): Promise<{ found: false } | { found: true; status: string }> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ status: appVideo.status })
      .from(appVideo)
      .where(and(eq(appVideo.id, videoId), eq(appVideo.userId, userId)))
      .limit(1);
    if (rows.length === 0) return { found: false } as const;
    return { found: true, status: rows[0].status } as const;
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
  return withDb(env, async (db) => {
    const rows = await db
      .update(appVideo)
      .set({ status: toStatus, errorMessage: "" })
      .where(and(eq(appVideo.id, videoId), eq(appVideo.status, fromStatus)))
      .returning({ id: appVideo.id });
    return rows.length > 0;
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
  return withDb(env, async (db) => {
    const rows = await db
      .select({
        id: appVideo.id,
        userId: appVideo.userId,
        file: appVideo.file,
      })
      .from(appVideo)
      .where(
        and(
          eq(appVideo.status, "uploading"),
          sql`${appVideo.uploadedAt} < NOW() - (${olderThanHours}::double precision * INTERVAL '1 hour')`,
        ),
      )
      .orderBy(asc(appVideo.uploadedAt))
      .limit(limit);
    return rows.map((r) => ({
      id: Number(r.id),
      userId: Number(r.userId),
      fileKey: r.file || null,
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
  return withDb(env, async (db) => {
    const rows = await db
      .insert(appVideo)
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
      .returning({ id: appVideo.id });
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
  return withDb(env, async (db) => {
    const rows = await db
      .insert(appVideo)
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
      .returning({ id: appVideo.id });
    return Number(rows[0].id);
  });
}

/** 削除前に file_key と存在を取得（file 空文字/NULL は null）。 */
export async function getVideoFileKey(
  env: Bindings,
  videoId: number,
  userId: number,
): Promise<{ found: false } | { found: true; fileKey: string | null }> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ file: appVideo.file })
      .from(appVideo)
      .where(and(eq(appVideo.id, videoId), eq(appVideo.userId, userId)))
      .limit(1);
    if (rows.length === 0) return { found: false } as const;
    return { found: true, fileKey: rows[0].file || null };
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
  return withDb(env, async (db) => {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT 1 FROM app_video WHERE id = ${videoId} FOR UPDATE`);

      await tx.execute(sql`
        DELETE FROM app_learnerconceptstate
         WHERE concept_id IN (SELECT id FROM app_plogconcept WHERE video_id = ${videoId})
      `);
      await tx.execute(sql`
        DELETE FROM app_ploglearningobject
         WHERE concept_id IN (SELECT id FROM app_plogconcept WHERE video_id = ${videoId})
      `);
      await tx.delete(appPlogedge).where(eq(appPlogedge.videoId, videoId));
      await tx.delete(appPlogconcept).where(eq(appPlogconcept.videoId, videoId));

      await tx.delete(appPlogsummarynode).where(eq(appPlogsummarynode.videoId, videoId));
      await tx.delete(appPlogbuildjob).where(eq(appPlogbuildjob.videoId, videoId));
      await tx.delete(appVideotag).where(eq(appVideotag.videoId, videoId));
      await tx.delete(appVideogroupmember).where(eq(appVideogroupmember.videoId, videoId));

      await tx
        .delete(appVideo)
        .where(and(eq(appVideo.id, videoId), eq(appVideo.userId, userId)));
    });
  });
}

export async function listVideosPage(
  env: Bindings,
  userId: number,
  criteria: VideoListCriteria,
  limit: number,
  offset: number,
): Promise<{ count: number; results: VideoListItem[] }> {
  const where = buildFilterConditions(userId, criteria);
  const orderBy = ORDER_MAP[criteria.sortKey] ?? desc(appVideo.uploadedAt);

  const { rows, count } = await withDb(env, async (db) => {
    await db.execute(sql.raw(`SET timezone = '${APP_TIMEZONE}'`));

    const countRows = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(appVideo)
      .where(where);

    const listRows = await db
      .select({
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
      .from(appVideo)
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
