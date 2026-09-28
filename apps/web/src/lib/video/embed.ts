export function buildYoutubeEmbedSrc(embedUrl: string, startSeconds: number | null): string {
  if (startSeconds === null || !Number.isFinite(startSeconds)) {
    return embedUrl;
  }
  // The iframe URL accepts whole seconds; native video seeks retain precision.
  return `${embedUrl}?autoplay=1&start=${Math.max(0, Math.floor(startSeconds))}`;
}
