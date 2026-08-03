/**
 * Python の `json.dumps(obj, ensure_ascii=False)` 互換の文字列化。
 * 既定の区切り（`", "` / `": "`）を使う点だけが `JSON.stringify` と異なる。
 */
export function pyJsonDumps(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(pyJsonDumps).join(", ")}]`;
  }
  if (value !== null && typeof value === "object") {
    const body = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${JSON.stringify(k)}: ${pyJsonDumps(v)}`)
      .join(", ");
    return `{${body}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * `json.dumps(..., sort_keys=True, ensure_ascii=False)` 相当。
 * PLOG merge の `_stable_key` 用（オブジェクトキーをソート）。
 */
export function pyJsonDumpsSorted(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(pyJsonDumpsSorted).join(", ")}]`;
  }
  if (value !== null && typeof value === "object") {
    const body = Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}: ${pyJsonDumpsSorted((value as Record<string, unknown>)[k])}`,
      )
      .join(", ");
    return `{${body}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** `_stable_key` 相当。シリアライズ不能なら `str(item)`。 */
export function stableKey(item: unknown): string {
  try {
    return pyJsonDumpsSorted(item);
  } catch {
    return String(item);
  }
}
