export interface TranscriptSegment {
  timestamp: string;
  seconds: number;
  text: string;
}

export function isSrtFormat(text: string): boolean {
  return /\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/.test(text);
}

export function parseSrtTranscript(srt: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const blocks = srt.replace(/\r\n?/g, '\n').trim().split(/\n[ \t]*\n/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    const timingLineIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingLineIndex === -1) continue;

    const match = lines[timingLineIndex].match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
    if (!match) continue;

    const hours = Number.parseInt(match[1], 10);
    const minutes = Number.parseInt(match[2], 10);
    const secondsPart = Number.parseInt(match[3], 10);
    const seconds = hours * 3600 + minutes * 60 + secondsPart;
    const timestamp = `${match[1]}:${match[2]}:${match[3]}`;

    const text = lines
      .slice(timingLineIndex + 1)
      .join(' ')
      .trim();

    if (text) {
      segments.push({ timestamp, seconds, text });
    }
  }

  return segments;
}

export function filterTranscriptSegments(
  segments: TranscriptSegment[],
  query: string,
): TranscriptSegment[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return segments;
  }
  return segments.filter((segment) =>
    segment.text.toLowerCase().includes(normalizedQuery),
  );
}
