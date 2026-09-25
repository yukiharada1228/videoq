/**
 * transcript の SRT 形式を検証する。
 * 空/空白のみは検証をスキップ。各ブロックは index 行(整数)/timestamp 行/本文 の 3 行以上。
 */
const SRT_TIMESTAMP_RE =
  /^\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}$/;

export const INVALID_SRT_MESSAGE = "Transcript must be in valid SRT format.";

function* iterSrtBlocks(value: string): Generator<string> {
  const content = value.replace(/\r\n?/g, "\n");
  let start = 0;
  for (const separator of content.matchAll(/\n[ \t]*\n/g)) {
    const block = content.slice(start, separator.index).trim();
    if (block) yield block;
    start = separator.index + separator[0].length;
  }
  const last = content.slice(start).trim();
  if (last) yield last;
}

/** 不正なら INVALID_SRT_MESSAGE、妥当なら null。 */
export function validateTranscriptSrt(value: string): string | null {
  for (const block of iterSrtBlocks(value)) {
    const lines = block.split("\n", 3);
    if (lines.length < 3) return INVALID_SRT_MESSAGE;
    // int(lines[0].strip())（符号付き整数のみ）
    if (!/^[+-]?\d+$/.test(lines[0].trim())) return INVALID_SRT_MESSAGE;
    if (!SRT_TIMESTAMP_RE.test(lines[1].trim())) return INVALID_SRT_MESSAGE;
  }
  return null;
}
