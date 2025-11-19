/**
 * YouTube URL utilities
 */

/**
 * Extract YouTube video ID from various URL formats
 */
export function extractYouTubeVideoId(url: string): string | null {
  if (!url) return null;

  // Pattern for standard YouTube URLs
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  // Try parsing as URL
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
      if (urlObj.pathname.startsWith('/watch')) {
        const videoId = urlObj.searchParams.get('v');
        if (videoId && videoId.length === 11) {
          return videoId;
        }
      } else if (urlObj.pathname.startsWith('/embed/')) {
        const videoId = urlObj.pathname.split('/embed/')[1]?.split('?')[0];
        if (videoId && videoId.length === 11) {
          return videoId;
        }
      } else if (urlObj.hostname.includes('youtu.be')) {
        const videoId = urlObj.pathname.slice(1).split('?')[0];
        if (videoId && videoId.length === 11) {
          return videoId;
        }
      }
    }
  } catch {
    // Invalid URL format
  }

  return null;
}

/**
 * Get YouTube embed URL from video ID or URL
 */
export function getYouTubeEmbedUrl(videoIdOrUrl: string): string | null {
  const videoId = videoIdOrUrl.length === 11 ? videoIdOrUrl : extractYouTubeVideoId(videoIdOrUrl);
  if (!videoId) return null;
  return `https://www.youtube.com/embed/${videoId}`;
}

