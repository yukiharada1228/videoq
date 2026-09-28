/** Shared upload formats, ordered for validation messages. */
export const VIDEO_UPLOAD_TYPES = {
  '.3gp': 'video/3gpp',
  '.avi': 'video/x-msvideo',
  '.m4v': 'video/x-m4v',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
  '.webm': 'video/webm',
} as const;

const contentTypes = new Set<string>(Object.values(VIDEO_UPLOAD_TYPES));

/** A leading dot alone is not an extension; directory names are ignored. */
export function fileExtension(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  let start = 0;
  while (start < base.length && base[start] === '.') start++;
  const dot = base.lastIndexOf('.');
  return dot < start ? '' : base.slice(dot).toLowerCase();
}

export function isAllowedExtension(ext: string): ext is keyof typeof VIDEO_UPLOAD_TYPES {
  return Object.hasOwn(VIDEO_UPLOAD_TYPES, ext);
}

export function isAllowedContentType(contentType: string): boolean {
  return contentTypes.has(contentType);
}

/** Infer only when the browser has no specific MIME type; explicit types stay validated. */
export function videoUploadContentType(file: { name: string; type: string }): string | null {
  const ext = fileExtension(file.name);
  if (!isAllowedExtension(ext)) return null;
  if (!file.type || file.type === 'application/octet-stream') return VIDEO_UPLOAD_TYPES[ext];
  return isAllowedContentType(file.type) ? file.type : null;
}
