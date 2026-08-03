/**
 * YouTube URL 検証・動画 ID 抽出（use_cases/video/youtube.py extract_youtube_video_id と一致）。
 */
const VALID_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

export const INVALID_YOUTUBE_URL_MESSAGE = "Invalid YouTube URL.";

/**
 * URL から 11 桁の動画 ID を抽出。不正なら null（呼び出し側で "Invalid YouTube URL."）。
 * Python urlparse + parse_qs のロジックを踏襲。
 */
export function extractYoutubeVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }

  const scheme = parsed.protocol.replace(/:$/, "");
  const netloc = parsed.host.toLowerCase(); // host は hostname[:port]（Python netloc 相当）
  if ((scheme !== "http" && scheme !== "https") || !VALID_HOSTS.has(netloc)) {
    return null;
  }

  const path = parsed.pathname;
  let candidate = "";
  if (netloc.endsWith("youtu.be")) {
    candidate = path.replace(/^\/+|\/+$/g, "").split("/")[0] ?? "";
  } else if (path === "/watch") {
    candidate = parsed.searchParams.get("v") ?? "";
  } else if (path.startsWith("/embed/") || path.startsWith("/shorts/")) {
    candidate = path.replace(/^\/+|\/+$/g, "").split("/")[1] ?? "";
  }

  const stripped = candidate.replace(/[-_]/g, "");
  if (candidate.length !== 11 || stripped.length === 0 || !/^[a-zA-Z0-9]+$/.test(stripped)) {
    return null;
  }
  return candidate;
}
