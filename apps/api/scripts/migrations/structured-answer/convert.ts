/** Frozen, one-time conversion of pre-996 history. Never imported by the application. */
import { parseCitationParts } from "./legacy-content";

type Source = { id: number; video_id: number; title: string; start_time: string | null; end_time: string | null };
export function convertHistoricalAnswer(text: string, rawSources: unknown) {
  if (typeof text !== "string") throw new Error("Invalid historical answer");
  let raw = rawSources;
  if (typeof rawSources === "string") {
    try { raw = JSON.parse(rawSources); }
    catch { throw new Error("Invalid historical sources JSON"); }
  }
  if (raw !== null && !Array.isArray(raw)) throw new Error("Invalid historical sources");
  const sources: Source[] = (raw ?? []).flatMap((source: Record<string, unknown>, index: number) => {
    if (!source || !Number.isSafeInteger(source.video_id) || Number(source.video_id) <= 0 || typeof source.title !== "string"
      || (source.start_time != null && typeof source.start_time !== "string")
      || (source.end_time != null && typeof source.end_time !== "string")) {
      throw new Error("Invalid historical source metadata");
    }
    return [{ id: index + 1, video_id: source.video_id as number, title: source.title,
      start_time: source.start_time as string | null ?? null, end_time: source.end_time as string | null ?? null }];
  });
  const validIds = new Set(sources.map(source => source.id));
  const segments: Array<{ text: string; sourceIds: number[] }> = [];
  for (const part of parseCitationParts(text, id => validIds.has(id))) {
    const last = segments.at(-1);
    if (part.type === "text") {
      if (last && last.sourceIds.length === 0) last.text += part.text;
      else segments.push({ text: part.text, sourceIds: [] });
    } else {
      const segment = last ?? { text: "", sourceIds: [] };
      if (!last) segments.push(segment);
      if (!segment.sourceIds.includes(part.sourceId)) segment.sourceIds.push(part.sourceId);
    }
  }
  if (segments.length === 0) segments.push({ text: "", sourceIds: [] });
  return { segments, sources };
}
