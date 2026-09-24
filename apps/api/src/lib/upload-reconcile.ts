import { getR2ObjectSize } from "../integrations/media";
import {
  deleteVideoCascade,
  listStaleUploadingVideos,
} from "../repositories/video-repository";
import type { Bindings } from "../types/bindings";
import { parseReservedBytesFromFileKey } from "./upload";
import { processExternalTaskById } from "./external-tasks";

/** 署名 URL 有効期限(1h) + 余裕。これより古い uploading を放棄とみなす。 */
export const DEFAULT_ABANDON_HOURS = 2;

/** TASK_SCHEDULER が放棄アップロードの回収時刻を決めるのに使う。 */
export const ABANDONED_UPLOAD_MS = DEFAULT_ABANDON_HOURS * 60 * 60 * 1000;

export type ReconcileResult = {
  scanned: number;
  released: number;
  releasedBytes: number;
  errors: number;
};

/**
 * アップロード放棄の自動解放（FR-Q3）。
 * status=uploading かつ古い行を削除し、予約ストレージを GREATEST(0, used-size) で戻す。
 * file key の予約バイトを優先し、旧形式だけ R2 実サイズを調べる。
 */
export async function reconcileAbandonedUploads(
  env: Bindings,
  olderThanHours: number = DEFAULT_ABANDON_HOURS,
): Promise<ReconcileResult> {
  const stale = await listStaleUploadingVideos(env, olderThanHours);
  const result: ReconcileResult = {
    scanned: stale.length,
    released: 0,
    releasedBytes: 0,
    errors: 0,
  };

  for (const row of stale) {
    try {
      const bytes = await resolveStorageBytesForRelease(env, row.fileKey);

      const deleted = await deleteVideoCascade(env, row.id, row.userId, {
        expectedStatus: "uploading",
        fallbackStorageBytes: bytes,
      });
      if (!deleted.deleted) continue;

      const completed =
        deleted.cleanupTaskId === null
          ? true
          : await processExternalTaskById(env, deleted.cleanupTaskId);
      if (completed && bytes !== null && bytes > 0) result.releasedBytes += bytes;

      result.released += 1;
    } catch {
      result.errors += 1;
    }
  }

  return result;
}

/** DELETE 時: 予約バイトを優先し、旧形式 key のみ R2 実サイズを使う。 */
export async function resolveStorageBytesForRelease(
  env: Bindings,
  fileKey: string | null,
): Promise<number | null> {
  if (!fileKey) return null;
  const reservedBytes = parseReservedBytesFromFileKey(fileKey);
  if (reservedBytes !== null) return reservedBytes;
  try {
    const size = await getR2ObjectSize(env, fileKey);
    return size !== null && size > 0 ? size : null;
  } catch {
    return null;
  }
}
