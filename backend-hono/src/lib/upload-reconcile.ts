import { deleteR2Object, getR2ObjectSize } from "../integrations/media";
import {
  clearOverQuotaIfWithinLimit,
  incrementStorageBytes,
} from "../repositories/quota-repository";
import {
  deleteVideoCascade,
  listStaleUploadingVideos,
} from "../repositories/video-repository";
import type { Bindings } from "../types/bindings";
import { parseReservedBytesFromFileKey } from "./upload";

/** 署名 URL 有効期限(1h) + 余裕。これより古い uploading を放棄とみなす。 */
export const DEFAULT_ABANDON_HOURS = 2;

export type ReconcileResult = {
  scanned: number;
  released: number;
  releasedBytes: number;
  errors: number;
};

/**
 * アップロード放棄の自動解放（FR-Q3）。
 * status=uploading かつ古い行を削除し、予約ストレージを GREATEST(0, used-size) で戻す。
 * サイズは R2 実体 > file key 埋め込み予約の順で決める。どちらも無ければ行だけ削除。
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
      let bytes: number | null = null;
      if (row.fileKey) {
        try {
          bytes = await getR2ObjectSize(env, row.fileKey);
        } catch {
          bytes = null;
        }
        if (bytes === null) {
          bytes = parseReservedBytesFromFileKey(row.fileKey);
        }
      }

      await deleteVideoCascade(env, row.id, row.userId);

      if (row.fileKey) {
        try {
          await deleteR2Object(env, row.fileKey);
        } catch {
          /* best-effort */
        }
      }

      if (bytes !== null && bytes > 0) {
        try {
          await incrementStorageBytes(env, row.userId, -bytes);
          result.releasedBytes += bytes;
        } catch {
          /* best-effort */
        }
      }
      try {
        await clearOverQuotaIfWithinLimit(env, row.userId);
      } catch {
        /* best-effort */
      }

      result.released += 1;
    } catch {
      result.errors += 1;
    }
  }

  return result;
}

/** DELETE 時: R2 サイズが取れなければ file key の予約バイトを使う。 */
export function resolveStorageBytesForRelease(
  fileKey: string | null,
  r2Size: number | null,
): number | null {
  if (r2Size !== null && r2Size > 0) return r2Size;
  if (!fileKey) return null;
  return parseReservedBytesFromFileKey(fileKey);
}
