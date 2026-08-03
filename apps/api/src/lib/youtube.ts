/**
 * VideoQ の YouTube URL 検証と動画 ID 抽出。
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
 * URL API で host と query parameter を解析する。
 */
export function extractYoutubeVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }

  const scheme = parsed.protocol.replace(/:$/, "");
  const host = parsed.host.toLowerCase(); // hostname[:port]
  if ((scheme !== "http" && scheme !== "https") || !VALID_HOSTS.has(host)) {
    return null;
  }

  const path = parsed.pathname;
  let candidate = "";
  if (host.endsWith("youtu.be")) {
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
