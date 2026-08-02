/**
 * Python の `csv.writer`（dialect=excel）互換の CSV 生成。
 * QUOTE_MINIMAL: 区切り文字 / 引用符 / CR / LF を含む場合のみ引用し、引用符は二重化。
 * 行終端は CRLF。
 */

import { pyJsonDumps } from "./py-json";
import type { ChatHistoryExportRow } from "../repositories/chat-repository";

const NEEDS_QUOTE = /[",\r\n]/;

export function csvField(value: string): string {
  return NEEDS_QUOTE.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function csvRow(fields: readonly string[]): string {
  return `${fields.map(csvField).join(",")}\r\n`;
}

export function csvDocument(rows: readonly (readonly string[])[]): string {
  return rows.map(csvRow).join("");
}

/**
 * チャット履歴 CSV（`write_chat_history_csv` 相当）。
 * created_at は DRF ではなくモデルの `datetime.isoformat()`（UTC）、
 * citations は `json.dumps(..., ensure_ascii=False)` の文字列。
 */
export function buildChatHistoryCsv(
  rows: readonly ChatHistoryExportRow[],
): string {
  return csvDocument([
    ["created_at", "question", "answer", "is_shared_origin", "citations", "feedback"],
    ...rows.map((r) => [
      r.created_at,
      r.question,
      r.answer,
      r.is_shared_origin ? "true" : "false",
      pyJsonDumps(r.citations),
      r.feedback ?? "",
    ]),
  ]);
}
