export function buildYoutubeEmbedSrc(embedUrl: string, startSeconds: number | null): string {
  if (startSeconds === null) {
    return embedUrl;
  }
  return `${embedUrl}?autoplay=1&start=${startSeconds}`;
}
