import { Hono } from "hono";
import type { Context } from "hono";
import {
  requireAuth,
  requireScope,
  apiKeyMethod,
  jwtMethod,
} from "../middleware/auth";
import { csrfProtect } from "../middleware/csrf";
import {
  listVideosPage,
  getVideoDetail,
  updateVideo,
  getVideoFileKey,
  deleteVideoCascade,
  createPendingVideo,
  createUploadedVideo,
  getVideoStatus,
  transitionVideoStatus,
  createYoutubeVideo,
} from "../repositories/video-repository";
import { enqueueTranscription, enqueueReindexTranscript } from "../lib/jobs";
import { extractYoutubeVideoId, INVALID_YOUTUBE_URL_MESSAGE } from "../lib/youtube";
import { validateTranscriptSrt } from "../lib/srt";
import { syncVectorTitle, deleteVideoVectors } from "../repositories/vector-repository";
import {
  incrementStorageBytes,
  clearOverQuotaIfWithinLimit,
  getMaxUploadSizeMb,
  checkAndReserveStorage,
} from "../repositories/quota-repository";
import {
  getR2ObjectSize,
  deleteR2Object,
  isS3Storage,
  presignR2Put,
  putMediaObject,
} from "../integrations/media";
import { videoOwnedBy } from "../repositories/membership-repository";
import { parseLimitOffset, limitOffsetPage } from "../utils/pagination";
import { apiError, drfValidationError } from "../utils/responses";
import { charField, integerField } from "../utils/drf-fields";
import {
  buildPendingUploadFileKey,
  fileExtension,
  isAllowedExtension,
  isAllowedContentType,
  unsupportedTypeMessage,
  invalidContentTypeMessage,
} from "../lib/upload";
import { resolveStorageBytesForRelease } from "../lib/upload-reconcile";
import type { AppEnv } from "../types/bindings";

/**
 * 移行済みの動画系ルート（VideoListView と契約互換）。
 *   GET /api/videos/  ── 現在ユーザーの動画一覧（q/status/ordering/tags + limit/offset）
 *
 * `file` は R2 presigned GET URL（youtube 等は null）。認証は [APIKey, CookieJWT]。
 */
export const videoRoutes = new Hono<AppEnv>();

const videoAuth = requireAuth(apiKeyMethod, jwtMethod);

const listVideos = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const { limit, offset } = parseLimitOffset(c);

  const tagsParam = c.req.query("tags")?.trim();
  let tagIds: number[] | null = null;
  if (tagsParam) {
    const parsed = tagsParam
      .split(",")
      .filter(Boolean)
      .map((t) => Number(t));
    // Django は int 変換失敗時に tag_ids=None（フィルタ無効）。
    tagIds = parsed.every((n) => Number.isInteger(n)) ? parsed : null;
  }

  const { count, results } = await listVideosPage(
    c.env,
    userId,
    {
      keyword: c.req.query("q")?.trim() ?? "",
      statusFilter: c.req.query("status")?.trim() ?? "",
      sortKey: c.req.query("ordering")?.trim() ?? "",
      tagIds,
    },
    limit,
    offset,
  );
  return c.json(limitOffsetPage(c, count, limit, offset, results));
};

// フルパスで定義し app.route("/", videoRoutes) でマウントする（health と同じ形）。
// サブアプリの root "/" を prefix にマウントすると末尾スラッシュにマッチしないため。
videoRoutes.get("/api/videos", videoAuth, listVideos);
videoRoutes.get("/api/videos/", videoAuth, listVideos);

// 詳細（VideoDetailView）。<int:pk> と同じく数値 id のみ。groups 等はマッチせずプロキシへ。
const detail = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const videoId = Number(c.req.param("id"));
  const video = await getVideoDetail(c.env, videoId, userId);
  if (!video) {
    // Django create_error_response("Video not found", 404) と同形
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Video not found" } },
      404,
    );
  }
  return c.json(video);
};

videoRoutes.get("/api/videos/:id{[0-9]+}", videoAuth, detail);
videoRoutes.get("/api/videos/:id{[0-9]+}/", videoAuth, detail);

// 書き込みガード（認証 → CSRF(Cookie 時) → scope=write）。
const videoWriteGuards = [
  requireAuth(apiKeyMethod, jwtMethod),
  csrfProtect,
  requireScope("write"),
] as const;

/**
 * `POST /api/videos/`
 * - USE_S3_STORAGE=false: Django CreateVideoUseCase 相当（multipart → VIDEO_BUCKET）
 * - USE_S3_STORAGE=true: 廃線（署名 URL 経路を案内）
 */
const createVideo = async (c: Context<AppEnv>) => {
  if (isS3Storage(c.env)) {
    return c.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Direct multipart upload is no longer supported. Use POST /api/videos/uploads/ then PUT the file to upload_url and PATCH the video with status \"uploaded\".",
        },
      },
      400,
    );
  }

  const userId = c.get("userId")!;
  let form: Record<string, string | File>;
  try {
    form = (await c.req.parseBody()) as Record<string, string | File>;
  } catch {
    return drfValidationError(c, { file: ["No file was submitted."] });
  }

  const file = form.file;
  if (!(file instanceof File)) {
    return drfValidationError(c, { file: ["No file was submitted."] });
  }

  const titleField = charField(
    { title: typeof form.title === "string" ? form.title : form.title?.toString() },
    "title",
    { required: true, maxLength: 255 },
  );
  if (titleField.kind !== "value") {
    return drfValidationError(c, {
      title: [titleField.kind === "error" ? titleField.message : "This field is required."],
    });
  }
  const descField = charField(
    {
      description:
        typeof form.description === "string"
          ? form.description
          : form.description?.toString(),
    },
    "description",
    { required: false, allowBlank: true },
  );
  if (descField.kind === "error") {
    return drfValidationError(c, { description: [descField.message] });
  }
  const title = titleField.value;
  const description = descField.kind === "value" ? descField.value : "";

  const ext = fileExtension(file.name || "");
  if (!isAllowedExtension(ext)) {
    return drfValidationError(c, { file: [unsupportedTypeMessage(ext)] });
  }
  const contentType = file.type || "application/octet-stream";
  if (!isAllowedContentType(contentType)) {
    return drfValidationError(c, { file: [invalidContentTypeMessage(contentType)] });
  }

  const fileSize = file.size;
  const maxMb = await getMaxUploadSizeMb(c.env, userId);
  if (fileSize > maxMb * 1024 * 1024) {
    return c.json(
      {
        error: {
          code: "FILE_TOO_LARGE",
          message: `File size exceeds the limit of ${maxMb} MB.`,
          params: { max_size_mb: maxMb },
        },
      },
      400,
    );
  }

  const reserve = await checkAndReserveStorage(c.env, userId, fileSize);
  if ("overQuota" in reserve) {
    return apiError(
      c,
      400,
      "Storage limit exceeded: account is over quota.",
      "STORAGE_LIMIT_EXCEEDED",
    );
  }
  if ("exceeded" in reserve) {
    return apiError(
      c,
      400,
      `Storage limit exceeded. Limit: ${reserve.limit} bytes.`,
      "STORAGE_LIMIT_EXCEEDED",
    );
  }

  const fileKey = buildPendingUploadFileKey(userId, fileSize, ext);
  try {
    await putMediaObject(c.env, fileKey, file.stream(), contentType);
  } catch {
    try {
      await incrementStorageBytes(c.env, userId, -fileSize);
    } catch {
      /* best-effort */
    }
    return apiError(c, 500, "Failed to store uploaded file.");
  }

  const videoId = await createUploadedVideo(c.env, userId, fileKey, title, description);
  try {
    await enqueueTranscription(c.env, videoId);
  } catch {
    /* Django も投入失敗は握りつぶし気味。レコードは残す */
  }

  const video = await getVideoDetail(c.env, videoId, userId);
  return c.json(video, 201);
};

videoRoutes.post("/api/videos", ...videoWriteGuards, createVideo);
videoRoutes.post("/api/videos/", ...videoWriteGuards, createVideo);

async function parseJsonBody(c: Context<AppEnv>): Promise<Record<string, unknown>> {
  const b = await c.req.json().catch(() => ({}));
  return b && typeof b === "object" ? (b as Record<string, unknown>) : {};
}

// VideoUploadRequestSerializer 相当（filename/content_type/file_size/title/description）。
function validateUploadRequest(
  body: Record<string, unknown>,
):
  | { errors: Record<string, string[]> }
  | {
      data: {
        filename: string;
        content_type: string;
        file_size: number;
        title: string;
        description: string;
      };
    } {
  const errors: Record<string, string[]> = {};
  const data: Partial<{
    filename: string;
    content_type: string;
    file_size: number;
    title: string;
    description: string;
  }> = {};

  const fn = charField(body, "filename", { required: true, maxLength: 255 });
  if (fn.kind === "error") errors.filename = [fn.message];
  else if (fn.kind === "value") {
    const ext = fileExtension(fn.value);
    if (!isAllowedExtension(ext)) errors.filename = [unsupportedTypeMessage(ext)];
    else data.filename = fn.value;
  }

  const ct = charField(body, "content_type", { required: true, maxLength: 100 });
  if (ct.kind === "error") errors.content_type = [ct.message];
  else if (ct.kind === "value") {
    if (!isAllowedContentType(ct.value)) errors.content_type = [invalidContentTypeMessage(ct.value)];
    else data.content_type = ct.value;
  }

  const fs = integerField(body, "file_size", { required: true, minValue: 1 });
  if (fs.kind === "error") errors.file_size = [fs.message];
  else if (fs.kind === "value") data.file_size = Number(fs.value);

  const t = charField(body, "title", { required: true, maxLength: 255 });
  if (t.kind === "error") errors.title = [t.message];
  else if (t.kind === "value") data.title = t.value;

  const d = charField(body, "description", { required: false, allowBlank: true });
  if (d.kind === "error") errors.description = [d.message];
  else if (d.kind === "value") data.description = d.value;
  else data.description = ""; // default=""

  if (Object.keys(errors).length) return { errors };
  return {
    data: {
      filename: data.filename!,
      content_type: data.content_type!,
      file_size: data.file_size!,
      title: data.title!,
      description: data.description ?? "",
    },
  };
}

// POST /api/videos/uploads/ ── 署名 URL 発行 + quota 予約（RequestVideoUploadUseCase）
const requestUpload = async (c: Context<AppEnv>) => {
  // Django LocalFileUploadGateway: USE_S3_STORAGE=False では presigned 不可
  if (!isS3Storage(c.env)) {
    return apiError(
      c,
      400,
      "Presigned upload URLs are unavailable when USE_S3_STORAGE=False.",
    );
  }

  const userId = c.get("userId")!;
  const body = await parseJsonBody(c);

  const v = validateUploadRequest(body);
  if ("errors" in v) return drfValidationError(c, v.errors);
  const { filename, content_type, file_size, title, description } = v.data;

  // FILE_TOO_LARGE（user.get_max_upload_size_bytes 超過）
  const maxMb = await getMaxUploadSizeMb(c.env, userId);
  if (file_size > maxMb * 1024 * 1024)
    return c.json(
      {
        error: {
          code: "FILE_TOO_LARGE",
          message: `File size exceeds the limit of ${maxMb} MB.`,
          params: { max_size_mb: maxMb },
        },
      },
      400,
    );

  // ストレージ確認＋予約（原子 UPDATE）
  const reserve = await checkAndReserveStorage(c.env, userId, file_size);
  if ("overQuota" in reserve)
    return apiError(c, 400, "Storage limit exceeded: account is over quota.", "STORAGE_LIMIT_EXCEEDED");
  if ("exceeded" in reserve)
    return apiError(c, 400, `Storage limit exceeded. Limit: ${reserve.limit} bytes.`, "STORAGE_LIMIT_EXCEEDED");

  // 保留動画レコード作成 + presigned PUT URL
  // file key に予約バイトを埋め込み（放棄解放 FR-Q3）
  const ext = fileExtension(filename);
  const fileKey = buildPendingUploadFileKey(userId, file_size, ext);
  const videoId = await createPendingVideo(c.env, userId, fileKey, title, description);
  const uploadUrl = await presignR2Put(c.env, fileKey, content_type);

  const video = await getVideoDetail(c.env, videoId, userId);
  return c.json({ video, upload_url: uploadUrl }, 201);
};

videoRoutes.post("/api/videos/uploads", ...videoWriteGuards, requestUpload);
videoRoutes.post("/api/videos/uploads/", ...videoWriteGuards, requestUpload);

// DRF URLField 近似（schemes: http/https/ftp/ftps）。youtube URL は全て通過するため実害は稀。
function isValidUrlFormat(value: string): boolean {
  try {
    const u = new URL(value);
    return ["http:", "https:", "ftp:", "ftps:"].includes(u.protocol);
  } catch {
    return false;
  }
}

// POST /api/videos/youtube/ ── YouTube 動画登録（CreateYoutubeVideoUseCase）
const createYoutube = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const body = await parseJsonBody(c);

  const errors: Record<string, string[]> = {};
  let youtubeVideoId: string | null = null;
  let sourceUrl = "";
  let title = "";
  let description = "";

  // youtube_url: URLField → validate_youtube_url（extract）
  const urlRes = charField(body, "youtube_url", { required: true });
  if (urlRes.kind === "error") errors.youtube_url = [urlRes.message];
  else if (urlRes.kind === "value") {
    if (!isValidUrlFormat(urlRes.value)) errors.youtube_url = ["Enter a valid URL."];
    else {
      const id = extractYoutubeVideoId(urlRes.value);
      if (id === null) errors.youtube_url = [INVALID_YOUTUBE_URL_MESSAGE];
      else {
        youtubeVideoId = id;
        sourceUrl = urlRes.value;
      }
    }
  }

  const titleRes = charField(body, "title", { required: true, maxLength: 255 });
  if (titleRes.kind === "error") errors.title = [titleRes.message];
  else if (titleRes.kind === "value") title = titleRes.value;

  const descRes = charField(body, "description", { required: false, allowBlank: true });
  if (descRes.kind === "error") errors.description = [descRes.message];
  else if (descRes.kind === "value") description = descRes.value; // absent → ""（default=""）

  if (Object.keys(errors).length) return drfValidationError(c, errors);

  const videoId = await createYoutubeVideo(c.env, userId, {
    sourceUrl,
    youtubeVideoId: youtubeVideoId!,
    title,
    description,
  });
  await enqueueTranscription(c.env, videoId);
  return c.json(await getVideoDetail(c.env, videoId, userId), 201);
};

videoRoutes.post("/api/videos/youtube", ...videoWriteGuards, createYoutube);
videoRoutes.post("/api/videos/youtube/", ...videoWriteGuards, createYoutube);

/** タイトル変更時の PGVector メタ同期（Django on_commit 相当・best-effort）。 */
async function bestEffortVectorTitleSync(
  c: Context<AppEnv>,
  videoId: number,
  newTitle: string | null,
): Promise<void> {
  if (newTitle === null) return;
  try {
    await syncVectorTitle(c.env, videoId, newTitle);
  } catch {
    // Django と同じく best-effort（失敗しても更新自体は成功扱い）
  }
}

// アップロード確定（ConfirmVideoUploadUseCase）: UPLOADING→PENDING + transcription enqueue。
const confirmUpload = async (
  c: Context<AppEnv>,
  videoId: number,
  userId: number,
) => {
  const cur = await getVideoStatus(c.env, videoId, userId);
  if (!cur.found) return apiError(c, 404, "Video not found");
  if (cur.status !== "uploading")
    return apiError(c, 400, `Video is in '${cur.status}' state, expected 'uploading'`);

  // UPLOADING → PENDING（条件付き）→ commit 後に transcription を SQS へ投入
  await transitionVideoStatus(c.env, videoId, "uploading", "pending");
  await enqueueTranscription(c.env, videoId);

  return c.json(await getVideoDetail(c.env, videoId, userId));
};

// PATCH /api/videos/:id/ ── VideoUpdateSerializer（partial, title/description/transcript）
// ※ status:"uploaded" はアップロード確定へ分岐。
const patchVideo = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const videoId = Number(c.req.param("id"));

  const body = await parseJsonBody(c);

  // アップロード確定（status:"uploaded"）は自前処理。
  if (body.status === "uploaded") return confirmUpload(c, videoId, userId);

  // 存在確認は serializer 検証より前（View が _get_video → 404 を先に返すため）
  if (!(await videoOwnedBy(c.env, videoId, userId)))
    return apiError(c, 404, "Video not found");

  const errors: Record<string, string[]> = {};
  const fields: { title?: string; description?: string; transcript?: string } = {};

  const titleRes = charField(body, "title", { required: false, maxLength: 255 });
  if (titleRes.kind === "error") errors.title = [titleRes.message];
  else if (titleRes.kind === "value") fields.title = titleRes.value;

  const descRes = charField(body, "description", { required: false, allowBlank: true });
  if (descRes.kind === "error") errors.description = [descRes.message];
  else if (descRes.kind === "value") fields.description = descRes.value;

  // transcript: CharField(required=False, allow_blank=True, trim_whitespace=False) + SRT 検証
  const trRes = charField(body, "transcript", {
    required: false,
    allowBlank: true,
    trimWhitespace: false,
  });
  if (trRes.kind === "error") errors.transcript = [trRes.message];
  else if (trRes.kind === "value") {
    const srtErr = validateTranscriptSrt(trRes.value);
    if (srtErr) errors.transcript = [srtErr];
    else fields.transcript = trRes.value;
  }

  if (Object.keys(errors).length) return drfValidationError(c, errors);

  const res = await updateVideo(c.env, videoId, userId, fields);
  if ("notFound" in res) return apiError(c, 404, "Video not found");
  // Django on_commit: title 変更→vector 同期(best-effort)、transcript 変更→再index enqueue
  if (res.titleChanged) await bestEffortVectorTitleSync(c, videoId, res.newTitle);
  if (res.transcriptChanged) await enqueueReindexTranscript(c.env, videoId);

  return c.json(await getVideoDetail(c.env, videoId, userId));
};

videoRoutes.patch("/api/videos/:id{[0-9]+}", ...videoWriteGuards, patchVideo);
videoRoutes.patch("/api/videos/:id{[0-9]+}/", ...videoWriteGuards, patchVideo);

// PUT /api/videos/:id/ ── VideoFullUpdateSerializer（title 必須, description default ""）
const putVideo = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const videoId = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const obj =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  // 存在確認は serializer 検証より前（View が _get_video → 404 を先に返すため）
  if (!(await videoOwnedBy(c.env, videoId, userId)))
    return apiError(c, 404, "Video not found");

  const errors: Record<string, string[]> = {};
  const fields: { title?: string; description?: string } = {};

  const titleRes = charField(obj, "title", { required: true, maxLength: 255 });
  if (titleRes.kind === "error") errors.title = [titleRes.message];
  else if (titleRes.kind === "value") fields.title = titleRes.value;

  const descRes = charField(obj, "description", { required: false, allowBlank: true });
  if (descRes.kind === "error") errors.description = [descRes.message];
  else if (descRes.kind === "value") fields.description = descRes.value;
  else fields.description = ""; // PUT は data.get("description", "") 相当

  if (Object.keys(errors).length) return drfValidationError(c, errors);

  const res = await updateVideo(c.env, videoId, userId, fields);
  if ("notFound" in res) return apiError(c, 404, "Video not found");
  if (res.titleChanged) await bestEffortVectorTitleSync(c, videoId, res.newTitle);

  return c.json(await getVideoDetail(c.env, videoId, userId));
};

videoRoutes.put("/api/videos/:id{[0-9]+}", ...videoWriteGuards, putVideo);
videoRoutes.put("/api/videos/:id{[0-9]+}/", ...videoWriteGuards, putVideo);

// DELETE /api/videos/:id/ ── ハード削除（DeleteVideoUseCase）
// 1) file_size 取得(best-effort, tx 前) → 2) tx で cascade 削除 →
// 3) commit 後: ベクトル削除・R2 削除・ストレージ会計（すべて best-effort）
const deleteVideo = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const videoId = Number(c.req.param("id"));

  const info = await getVideoFileKey(c.env, videoId, userId);
  if (!info.found) return apiError(c, 404, "Video not found");

  // 削除前にファイルサイズを取得（ストレージ会計用・best-effort）
  // R2 未着の uploading は file key 埋め込みの予約バイトで解放（FR-Q3）
  let r2Size: number | null = null;
  if (info.fileKey) {
    try {
      r2Size = await getR2ObjectSize(c.env, info.fileKey);
    } catch {
      r2Size = null;
    }
  }
  const fileSize = resolveStorageBytesForRelease(info.fileKey, r2Size);

  await deleteVideoCascade(c.env, videoId, userId);

  // commit 後の後片付け（Django の on_commit 相当・すべて失敗を握りつぶす）
  try {
    await deleteVideoVectors(c.env, videoId);
  } catch {
    /* best-effort */
  }
  if (info.fileKey) {
    try {
      await deleteR2Object(c.env, info.fileKey);
    } catch {
      /* best-effort */
    }
  }
  if (fileSize !== null) {
    try {
      await incrementStorageBytes(c.env, userId, -fileSize);
    } catch {
      /* best-effort */
    }
  }
  try {
    await clearOverQuotaIfWithinLimit(c.env, userId);
  } catch {
    /* best-effort */
  }

  return c.body(null, 204);
};

videoRoutes.delete("/api/videos/:id{[0-9]+}", ...videoWriteGuards, deleteVideo);
videoRoutes.delete("/api/videos/:id{[0-9]+}/", ...videoWriteGuards, deleteVideo);
