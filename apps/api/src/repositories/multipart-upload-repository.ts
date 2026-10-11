import { and, eq, isNotNull, sql } from "drizzle-orm";
import { multipartPartSize, MAX_UPLOAD_PARTS } from "@videoq/trpc/video-upload";
import { withDb } from "../db/pool";
import { videos } from "../db/schema";
import {
  abortR2MultipartUpload, completeR2MultipartUpload, createR2MultipartUpload,
  getR2ObjectSize, presignR2UploadPart, listR2MultipartParts,
} from "../integrations/media";
import { buildJobMessage, JOB_TRANSCRIBE_VIDEO } from "../lib/job-message";
import { parseReservedBytesFromFileKey } from "../lib/upload";
import type { Bindings } from "../types/bindings";
import { insertJobTask } from "./external-task-repository";

export class UploadSessionError extends Error {
  constructor(message: string, readonly code: "BAD_REQUEST" | "NOT_FOUND" = "BAD_REQUEST") {
    super(message);
  }
}

export async function listResumableUploads(env: Bindings, userId: string) {
  return withDb(env, db => db.select({ id: videos.id, title: videos.title }).from(videos)
    .where(and(eq(videos.userId, userId), eq(videos.status, "uploading"), isNotNull(videos.multipartUpload)))
    .orderBy(videos.id).limit(100));
}

// Serialize control operations and deletion on the video row. Only small R2
// control requests run under this lock; video bytes travel browser -> R2.
export async function initializeMultipartUpload(
  env: Bindings, videoId: number, userId: string, contentType: string,
) {
  let created: { fileKey: string; uploadId: string } | undefined;
  try {
    return await withDb(env, db => db.transaction(async tx => {
      const [video] = await tx.select({ file: videos.file, status: videos.status, session: videos.multipartUpload })
        .from(videos).where(and(eq(videos.id, videoId), eq(videos.userId, userId))).for("update");
      if (!video) throw new UploadSessionError("Video not found", "NOT_FOUND");
      if (video.status !== "uploading") throw new UploadSessionError("Upload is already confirmed");
      const fileSize = parseReservedBytesFromFileKey(video.file);
      if (!fileSize) throw new UploadSessionError("Upload reservation is missing");
      let session = video.session;
      if (!session) {
        const uploadId = await createR2MultipartUpload(env, video.file, contentType);
        created = { fileKey: video.file, uploadId };
        session = { uploadId, contentType, partSize: multipartPartSize(fileSize) };
      }
      await tx.update(videos).set({ multipartUpload: session, uploadHeartbeatAt: sql`now()` }).where(eq(videos.id, videoId));
      return { part_size: session.partSize, part_count: Math.ceil(fileSize / session.partSize) };
    }));
  } catch (error) {
    if (created) {
      try { await abortR2MultipartUpload(env, created.fileKey, created.uploadId); }
      catch { console.error(JSON.stringify({ event: "multipart_initialization_cleanup_failed", videoId })); }
    }
    throw error;
  }
}

export async function getMultipartUploadPartUrl(
  env: Bindings, videoId: number, userId: string, partNumber: number,
) {
  return withDb(env, db => db.transaction(async tx => {
    const [video] = await tx.select({ file: videos.file, status: videos.status, session: videos.multipartUpload })
      .from(videos).where(and(eq(videos.id, videoId), eq(videos.userId, userId))).for("update");
    if (!video) throw new UploadSessionError("Video not found", "NOT_FOUND");
    const session = video.session;
    if (video.status !== "uploading" || !session) throw new UploadSessionError("Multipart upload is not active");
    const size = parseReservedBytesFromFileKey(video.file);
    if (!size || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > Math.ceil(size / session.partSize)) {
      throw new UploadSessionError("Invalid upload part number");
    }
    const length = Math.min(session.partSize, size - (partNumber - 1) * session.partSize);
    const upload_url = await presignR2UploadPart(env, video.file, session.uploadId, partNumber, session.contentType, length);
    await tx.update(videos).set({ uploadHeartbeatAt: sql`now()` }).where(eq(videos.id, videoId));
    return { upload_url };
  }));
}

export async function resumeMultipartUpload(env: Bindings, videoId: number, userId: string, marker: number) {
  return withDb(env, db => db.transaction(async tx => {
    const [video] = await tx.select({ file: videos.file, status: videos.status, session: videos.multipartUpload })
      .from(videos).where(and(eq(videos.id, videoId), eq(videos.userId, userId))).for("update");
    if (!video) throw new UploadSessionError("Video not found", "NOT_FOUND");
    if (video.status !== "uploading") return { confirmed: true as const };
    const session = video.session;
    const size = parseReservedBytesFromFileKey(video.file);
    if (!session || !size) throw new UploadSessionError("Multipart upload is not active");
    // R2 may have completed before its response/DB commit was lost. Its part
    // list is then gone, but the unique reserved object remains recoverable.
    const stored = marker === 0 && await getR2ObjectSize(env, video.file) === size;
    const result = stored ? { parts: [], next_marker: null } :
      await listR2MultipartParts(env, video.file, session.uploadId, marker);
    const count = Math.ceil(size / session.partSize);
    if (result.parts.some(p => p.partNumber > count || p.size !== Math.min(session.partSize, size - (p.partNumber - 1) * session.partSize))) {
      throw new UploadSessionError("Uploaded part size does not match the reservation");
    }
    await tx.update(videos).set({ uploadHeartbeatAt: sql`now()` }).where(eq(videos.id, videoId));
    return { confirmed: false as const, stored, part_size: session.partSize, part_count: count,
      file_size: size, content_type: session.contentType, ...result };
  }));
}

export async function completeMultipartVideoUpload(
  env: Bindings, videoId: number, userId: string, parts: { partNumber: number; etag: string }[],
): Promise<number | null> {
  return withDb(env, db => db.transaction(async tx => {
    const [video] = await tx.select({ file: videos.file, status: videos.status, session: videos.multipartUpload })
      .from(videos).where(and(eq(videos.id, videoId), eq(videos.userId, userId))).for("update");
    if (!video) throw new UploadSessionError("Video not found", "NOT_FOUND");
    if (["pending", "processing", "indexing", "completed", "error"].includes(video.status)) return null;
    const session = video.session;
    if (video.status !== "uploading" || !session) throw new UploadSessionError("Multipart upload is not active");
    const size = parseReservedBytesFromFileKey(video.file);
    const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber);
    const actualBefore = await getR2ObjectSize(env, video.file);
    if (!size) throw new UploadSessionError("Upload reservation is missing");
    if (actualBefore !== size && (parts.length > MAX_UPLOAD_PARTS || parts.length !== Math.ceil(size / session.partSize) ||
        ordered.some((part, index) => part.partNumber !== index + 1 || !/^[a-fA-F0-9]{32}$/.test(part.etag)))) {
      throw new UploadSessionError("Upload parts are missing or invalid");
    }
    // Recover if R2 completed but the response/DB commit was lost. A unique
    // reserved file key and signed part lengths bind this object to this upload.
    let actual = actualBefore;
    if (actual === null) {
      await completeR2MultipartUpload(env, video.file, session.uploadId, ordered);
      actual = await getR2ObjectSize(env, video.file);
    }
    if (actual !== size) throw new UploadSessionError("Uploaded object size does not match the reserved size");
    await tx.update(videos).set({
      status: "pending", errorMessage: "", multipartUpload: null, uploadHeartbeatAt: null,
    }).where(eq(videos.id, videoId));
    const message = buildJobMessage(JOB_TRANSCRIBE_VIDEO, { video_id: videoId });
    const task = await insertJobTask(tx, { message });
    return task.id;
  }));
}
