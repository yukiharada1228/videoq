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

/** RFC 4180 chat-history export with native JSON in the citations field. */
export function buildChatHistoryCsv(
  rows: readonly ChatHistoryExportRow[],
): string {
  return csvDocument([
    [
      "created_at",
      "asked_by_user_id",
      "asked_by_username",
      "asked_by_email",
      "question",
      "answer",
      "is_shared_origin",
      "citations",
      "feedback",
    ],
    ...rows.map((r) => [
      r.created_at,
      r.asked_by?.user_id ?? "",
      r.asked_by?.username ?? "",
      r.asked_by?.email ?? "",
      r.question,
      r.answer,
      r.is_shared_origin ? "true" : "false",
      JSON.stringify(r.citations),
      r.feedback ?? "",
    ]),
  ]);
}
