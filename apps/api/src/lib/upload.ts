/**
 * 動画アップロード要求の定数と入力検証。
 */

// エラーメッセージの列挙順を固定するためソート済み。
export const ALLOWED_VIDEO_EXTENSIONS = [
  ".3gp",
  ".avi",
  ".m4v",
  ".mkv",
  ".mov",
  ".mp4",
  ".mpeg",
  ".mpg",
  ".webm",
] as const;

export const ALLOWED_VIDEO_MIMETYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
  "video/webm",
  "video/x-m4v",
  "video/mpeg",
  "video/3gpp",
]);

/**
 * 署名 URL 発行時の file key。
 * `videos/{userId}/video_{ms}_{reservedBytes}{ext}` — 予約バイト数を埋め込み、
 * アップロード放棄時（FR-Q3）に R2 未着でも解放できるようにする。
 */
export function buildPendingUploadFileKey(
  userId: string,
  reservedBytes: number,
  ext: string,
  nowMs: number = Date.now(),
): string {
  return `videos/${userId}/video_${nowMs}_${reservedBytes}${ext}`;
}

/**
 * file key から予約バイト数を読む（新形式のみ）。
 * 旧形式 `video_{ms}{ext}` は null。
 */
export function parseReservedBytesFromFileKey(fileKey: string): number | null {
  const base = fileKey.split(/[\\/]/).pop() ?? fileKey;
  // video_{timestamp}_{bytes}.ext
  const m = /^video_\d+_(\d+)\.[^.]+$/i.exec(base);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * ファイル名の最終サフィックスを小文字で返す。
 * 先頭ドットのみ（隠しファイル）は拡張子扱いしない。パス区切りは basename に落とす。
 */
export function fileExtension(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  // 先頭の連続ドットを除いた位置以降で最後のドットを探す。
  let start = 0;
  while (start < base.length && base[start] === ".") start++;
  const dot = base.lastIndexOf(".");
  if (dot <= start - 1 || dot < start) return "";
  if (dot < 0) return "";
  return base.slice(dot).toLowerCase();
}

export function unsupportedTypeMessage(ext: string): string {
  return `Unsupported file type: '${ext}'. Allowed types: ${ALLOWED_VIDEO_EXTENSIONS.join(", ")}`;
}

export function invalidContentTypeMessage(contentType: string): string {
  return `Invalid content type: '${contentType}'. Only video files are allowed.`;
}

export function isAllowedExtension(ext: string): boolean {
  return (ALLOWED_VIDEO_EXTENSIONS as readonly string[]).includes(ext);
}

export function isAllowedContentType(contentType: string): boolean {
  return ALLOWED_VIDEO_MIMETYPES.has(contentType);
}
