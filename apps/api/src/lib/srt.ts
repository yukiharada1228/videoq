/**
 * transcript の SRT 形式を検証する。
 * 空/空白のみは検証をスキップ。各ブロックは index 行(整数)/timestamp 行/本文 の 3 行以上。
 */
const SRT_TIMESTAMP_RE =
  /^\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}$/;

export const INVALID_SRT_MESSAGE = "Transcript must be in valid SRT format.";

/** 不正なら INVALID_SRT_MESSAGE、妥当なら null。 */
export function validateTranscriptSrt(value: string): string | null {
  if (!value || value.trim() === "") return null;

  const blocks = value
    .split("\n\n")
    .map((b) => b.trim())
    .filter((b) => b);
  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.length < 3) return INVALID_SRT_MESSAGE;
    // int(lines[0].strip())（符号付き整数のみ）
    if (!/^[+-]?\d+$/.test(lines[0].trim())) return INVALID_SRT_MESSAGE;
    if (!SRT_TIMESTAMP_RE.test(lines[1].trim())) return INVALID_SRT_MESSAGE;
  }
  return null;
}

/** HH:MM:SS,mmm / HH:MM:SS / ドット区切りの timestamp を秒へ変換する。 */
export function parseSrtTimestamp(timestamp: string): number {
  const normalized = timestamp.replace(/\./g, ",");
  const parts = normalized.split(",");
  const timeParts = parts[0]!.split(":").map((p) => Number.parseInt(p, 10));
  let hours: number;
  let minutes: number;
  let secondsPart: number;
  if (timeParts.length === 3) {
    [hours, minutes, secondsPart] = timeParts as [number, number, number];
  } else if (timeParts.length === 2) {
    hours = 0;
    [minutes, secondsPart] = timeParts as [number, number];
  } else {
    throw new Error(`Invalid timestamp: ${timestamp}`);
  }
  let seconds = hours * 3600 + minutes * 60 + secondsPart;
  if (parts.length > 1) seconds += Number.parseInt(parts[1]!, 10) / 1000;
  return seconds;
}

export type SrtScene = {
  index: number | null;
  start_time: string;
  end_time: string;
  start_sec: number;
  end_sec: number;
  text: string;
};

/** L0 Retrieve 用に SRT の scene 一覧を解析する。 */
export function parseSrtScenes(srtString: string): SrtScene[] {
  const content = srtString.trim();
  if (!content) return [];
  const blocks = content
    .split("\n\n")
    .map((b) => b.trim())
    .filter((b) => b);
  const scenes: SrtScene[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.length < 3) continue;
    let index: number | null = null;
    try {
      index = Number.parseInt(lines[0]!.trim(), 10);
      if (Number.isNaN(index)) index = null;
    } catch {
      index = null;
    }
    const timing = lines[1]!.trim();
    if (!timing.includes("-->")) continue;
    const [startStr, endStr] = timing.split("-->").map((t) => t.trim());
    if (!startStr || !endStr) continue;
    const text = lines
      .slice(2)
      .map((l) => l.trim())
      .filter((l) => l)
      .join(" ");
    scenes.push({
      index,
      start_time: startStr,
      end_time: endStr,
      start_sec: parseSrtTimestamp(startStr),
      end_sec: parseSrtTimestamp(endStr),
      text,
    });
  }
  return scenes;
}
