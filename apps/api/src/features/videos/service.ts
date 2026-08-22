import {
  listVideosPage,
  getVideoDetail,
  updateVideo,
  getVideoFileKey,
  deleteVideoCascade,
  getVideoStatus,
  transitionVideoStatus,
  reserveAndCreatePendingVideo,
  createYoutubeVideo,
} from "../../repositories/video-repository";
import { validateTranscriptSrt } from "../../lib/srt";
import { getMaxUploadSizeMb } from "../../repositories/quota-repository";
import {
  getR2ObjectSize,
  isS3Storage,
  putMediaObject,
  presignR2Put,
} from "../../integrations/media";
import { videoOwnedBy } from "../../repositories/membership-repository";
import { resolveStorageBytesForRelease } from "../../lib/upload-reconcile";
import {
  buildPendingUploadFileKey,
  fileExtension,
  isAllowedExtension,
  isAllowedContentType,
  parseReservedBytesFromFileKey,
  unsupportedTypeMessage,
  invalidContentTypeMessage,
} from "../../lib/upload";
import {
  extractYoutubeVideoId,
  INVALID_YOUTUBE_URL_MESSAGE,
} from "../../lib/youtube";
import type { Bindings } from "../../types/bindings";
import type { UploadRequest, YoutubeCreateRequest } from "./schemas";
import { processExternalTaskById } from "../../lib/external-tasks";

const reportBestEffortFailure = (operation: string, error: unknown) => {
  console.error({ event: "best_effort_failed", operation, error });
};

async function dispatchCleanupTask(
  env: Bindings,
  taskId: number | null,
): Promise<void> {
  if (taskId !== null) await processExternalTaskById(env, taskId);
}

export type MultipartVideoResult =
  | { ok: true; video: Awaited<ReturnType<typeof getVideoDetail>> }
  | { ok: false; status: number; body: unknown };

export function parseTagIds(tagsParam: string | undefined): number[] | null {
  if (!tagsParam?.trim()) return null;
  const parsed = tagsParam
    .split(",")
    .filter(Boolean)
    .map((t) => Number(t));
  return parsed.every((n) => Number.isInteger(n)) ? parsed : null;
}

export async function listUserVideos(
  env: Bindings,
  userId: string,
  query: {
    q?: string;
    status?: string;
    ordering?: string;
    tags?: string;
  },
  limit: number,
  offset: number,
) {
  return listVideosPage(
    env,
    userId,
    {
      keyword: query.q?.trim() ?? "",
      statusFilter: query.status?.trim() ?? "",
      sortKey: query.ordering?.trim() ?? "",
      tagIds: parseTagIds(query.tags),
    },
    limit,
    offset,
  );
}

export async function getUserVideo(
  env: Bindings,
  videoId: number,
  userId: string,
) {
  return getVideoDetail(env, videoId, userId);
}

export async function requestPresignedUpload(
  env: Bindings,
  userId: string,
  body: UploadRequest,
) {
  if (!isS3Storage(env)) {
    return {
      badRequest:
        "Presigned upload URLs are unavailable when USE_S3_STORAGE=False.",
    } as const;
  }

  const fieldError: Record<string, string[]> = {};
  const ext = fileExtension(body.filename);
  if (!isAllowedExtension(ext)) {
    fieldError.filename = [unsupportedTypeMessage(ext)];
  }
  if (!isAllowedContentType(body.content_type)) {
    fieldError.content_type = [invalidContentTypeMessage(body.content_type)];
  }
  if (Object.keys(fieldError).length) return { fieldError } as const;

  const maxMb = await getMaxUploadSizeMb(env, userId);
  if (body.file_size > maxMb * 1024 * 1024) {
    return { fileTooLarge: true, maxMb } as const;
  }

  const fileKey = buildPendingUploadFileKey(userId, body.file_size, ext);
  const pending = await reserveAndCreatePendingVideo(
    env,
    userId,
    body.file_size,
    fileKey,
    body.title,
    body.description,
  );
  if ("overQuota" in pending) {
    return {
      badRequest: "Storage limit exceeded: account is over quota.",
      code: "STORAGE_LIMIT_EXCEEDED",
    } as const;
  }
  if ("exceeded" in pending) {
    return {
      badRequest: `Storage limit exceeded. Limit: ${pending.limit} bytes.`,
      code: "STORAGE_LIMIT_EXCEEDED",
    } as const;
  }

  const videoId = pending.videoId;
  try {
    const uploadUrl = await presignR2Put(
      env,
      fileKey,
      body.content_type,
      body.file_size,
    );
    return {
      video: await getVideoDetail(env, videoId, userId),
      upload_url: uploadUrl,
    } as const;
  } catch (error) {
    try {
      const deleted = await deleteVideoCascade(env, videoId, userId, {
        expectedStatus: "uploading",
        fallbackStorageBytes: body.file_size,
      });
      await dispatchCleanupTask(env, deleted.cleanupTaskId);
    } catch (cleanupError) {
      reportBestEffortFailure("presigned_upload_cleanup", cleanupError);
    }
    throw error;
  }
}

function isValidUrlFormat(value: string): boolean {
  try {
    const url = new URL(value);
    return ["http:", "https:", "ftp:", "ftps:"].includes(url.protocol);
  } catch {
    return false;
  }
}

export async function createUserYoutubeVideo(
  env: Bindings,
  userId: string,
  body: YoutubeCreateRequest,
) {
  if (!isValidUrlFormat(body.youtube_url)) {
    return { fieldError: { youtube_url: ["Enter a valid URL."] } } as const;
  }
  const youtubeVideoId = extractYoutubeVideoId(body.youtube_url);
  if (youtubeVideoId === null) {
    return {
      fieldError: { youtube_url: [INVALID_YOUTUBE_URL_MESSAGE] },
    } as const;
  }

  const created = await createYoutubeVideo(env, userId, {
    sourceUrl: body.youtube_url,
    youtubeVideoId,
    title: body.title,
    description: body.description,
  });
  await processExternalTaskById(env, created.taskId);
  return { video: await getVideoDetail(env, created.videoId, userId) } as const;
}

export async function confirmVideoUpload(
  env: Bindings,
  videoId: number,
  userId: string,
) {
  const cur = await getVideoStatus(env, videoId, userId);
  if (!cur.found) return { notFound: true } as const;
  if (cur.status !== "uploading") {
    return {
      badState: true as const,
      message: `Video is in '${cur.status}' state, expected 'uploading'`,
    };
  }

  const upload = await getVideoFileKey(env, videoId, userId);
  if (!upload.found || !upload.fileKey) return { notFound: true } as const;
  const reservedBytes = parseReservedBytesFromFileKey(upload.fileKey);
  const actualBytes = await getR2ObjectSize(env, upload.fileKey);
  if (actualBytes === null) {
    return {
      badState: true as const,
      message: "Uploaded object was not found.",
    };
  }
  if (reservedBytes !== null && actualBytes !== reservedBytes) {
    const deleted = await deleteVideoCascade(env, videoId, userId, {
      expectedStatus: "uploading",
      fallbackStorageBytes: reservedBytes,
    });
    await dispatchCleanupTask(env, deleted.cleanupTaskId);
    return {
      badState: true as const,
      message: "Uploaded object size does not match the reserved size.",
    };
  }
  const transitioned = await transitionVideoStatus(
    env,
    videoId,
    "uploading",
    "pending",
  );
  if (!transitioned) {
    return {
      badState: true as const,
      message: "Video upload was already confirmed.",
    };
  }
  await processExternalTaskById(env, transitioned.taskId);
  return { video: await getVideoDetail(env, videoId, userId) } as const;
}

export async function patchUserVideo(
  env: Bindings,
  videoId: number,
  userId: string,
  fields: { title?: string; description?: string; transcript?: string },
) {
  if (!(await videoOwnedBy(env, videoId, userId))) {
    return { notFound: true } as const;
  }
  if (fields.transcript !== undefined) {
    const srtErr = validateTranscriptSrt(fields.transcript);
    if (srtErr) return { fieldError: { transcript: [srtErr] } } as const;
  }

  const res = await updateVideo(env, videoId, userId, fields);
  if ("notFound" in res) return { notFound: true } as const;

  if (res.reindexTaskId !== null) {
    await processExternalTaskById(env, res.reindexTaskId);
  }
  return { video: await getVideoDetail(env, videoId, userId) } as const;
}

export async function putUserVideo(
  env: Bindings,
  videoId: number,
  userId: string,
  fields: { title: string; description: string },
) {
  if (!(await videoOwnedBy(env, videoId, userId))) {
    return { notFound: true } as const;
  }
  const res = await updateVideo(env, videoId, userId, fields);
  if ("notFound" in res) return { notFound: true } as const;
  return { video: await getVideoDetail(env, videoId, userId) } as const;
}

export async function deleteUserVideo(
  env: Bindings,
  videoId: number,
  userId: string,
) {
  const info = await getVideoFileKey(env, videoId, userId);
  if (!info.found) return { notFound: true } as const;

  let r2Size: number | null = null;
  if (info.fileKey) {
    try {
      r2Size = await getR2ObjectSize(env, info.fileKey);
    } catch {
      r2Size = null;
    }
  }
  const fileSize = resolveStorageBytesForRelease(info.fileKey, r2Size);

  const deleted = await deleteVideoCascade(env, videoId, userId, {
    fallbackStorageBytes: fileSize,
  });
  if (!deleted.deleted) return { notFound: true } as const;

  await dispatchCleanupTask(env, deleted.cleanupTaskId);

  return { ok: true } as const;
}

/** ローカル VIDEO_BUCKET 向け multipart upload（USE_S3_STORAGE=false のみ）。 */
export async function createVideoFromMultipart(
  env: Bindings,
  userId: string,
  form: Record<string, string | File>,
): Promise<MultipartVideoResult> {
  if (isS3Storage(env)) {
    return {
      ok: false,
      status: 400,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Direct multipart upload is no longer supported. Use POST /api/videos/uploads/ then PUT the file to upload_url and PATCH the video with status \"uploaded\".",
        },
      },
    };
  }

  const file = form.file;
  if (!(file instanceof File)) {
    return {
      ok: false,
      status: 400,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: "No file was submitted.",
          details: { file: ["No file was submitted."] },
        },
      },
    };
  }

  const titleRaw = typeof form.title === "string" ? form.title.trim() : "";
  if (!titleRaw) {
    const msg =
      form.title === undefined || form.title === ""
        ? form.title === ""
          ? "This field may not be blank."
          : "This field is required."
        : "Not a valid string.";
    return {
      ok: false,
      status: 400,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: msg,
          details: { title: [msg] },
        },
      },
    };
  }
  if ([...titleRaw].length > 255) {
    const msg = "Ensure this field has no more than 255 characters.";
    return {
      ok: false,
      status: 400,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: msg,
          details: { title: [msg] },
        },
      },
    };
  }
  const description =
    typeof form.description === "string" ? form.description : "";
  const title = titleRaw;

  const ext = fileExtension(file.name || "");
  if (!isAllowedExtension(ext)) {
    const msg = unsupportedTypeMessage(ext);
    return {
      ok: false,
      status: 400,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: msg,
          details: { file: [msg] },
        },
      },
    };
  }
  const contentType = file.type || "application/octet-stream";
  if (!isAllowedContentType(contentType)) {
    const msg = invalidContentTypeMessage(contentType);
    return {
      ok: false,
      status: 400,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: msg,
          details: { file: [msg] },
        },
      },
    };
  }

  const fileSize = file.size;
  const maxMb = await getMaxUploadSizeMb(env, userId);
  if (fileSize > maxMb * 1024 * 1024) {
    return {
      ok: false,
      status: 400,
      body: {
        error: {
          code: "FILE_TOO_LARGE",
          message: `File size exceeds the limit of ${maxMb} MB.`,
          params: { max_size_mb: maxMb },
        },
      },
    };
  }

  const fileKey = buildPendingUploadFileKey(userId, fileSize, ext);
  const pending = await reserveAndCreatePendingVideo(
    env,
    userId,
    fileSize,
    fileKey,
    title,
    description,
  );
  if ("overQuota" in pending) {
    return {
      ok: false,
      status: 400,
      body: {
        error: {
          code: "STORAGE_LIMIT_EXCEEDED",
          message: "Storage limit exceeded: account is over quota.",
        },
      },
    };
  }
  if ("exceeded" in pending) {
    return {
      ok: false,
      status: 400,
      body: {
        error: {
          code: "STORAGE_LIMIT_EXCEEDED",
          message: `Storage limit exceeded. Limit: ${pending.limit} bytes.`,
        },
      },
    };
  }

  try {
    await putMediaObject(env, fileKey, file.stream(), contentType);
  } catch {
    try {
      const deleted = await deleteVideoCascade(env, pending.videoId, userId, {
        expectedStatus: "uploading",
        fallbackStorageBytes: fileSize,
      });
      await dispatchCleanupTask(env, deleted.cleanupTaskId);
    } catch {
      /* cleanup task is persisted atomically with the video deletion */
    }
    return {
      ok: false,
      status: 500,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: "Failed to store uploaded file.",
        },
      },
    };
  }

  let transitioned: false | { taskId: number };
  try {
    transitioned = await transitionVideoStatus(
      env,
      pending.videoId,
      "uploading",
      "pending",
    );
  } catch {
    return {
      ok: false,
      status: 500,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: "Failed to finalize uploaded video.",
        },
      },
    };
  }
  if (transitioned) await processExternalTaskById(env, transitioned.taskId);

  const video = await getVideoDetail(env, pending.videoId, userId);
  return { ok: true, video };
}
