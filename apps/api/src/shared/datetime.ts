/**
 * 新 API 契約向け UTC ISO-8601 文字列（例: `2026-08-03T01:00:00.000Z`）。
 */
export function toUtcIso(value: string | Date | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid datetime value: ${String(value)}`);
  }
  return date.toISOString();
}
