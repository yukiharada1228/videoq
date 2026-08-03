/**
 * DRF DateTimeField（iso-8601）互換の文字列を作る。
 * DRF は USE_TZ=True のとき `enforce_timezone` で settings.TIME_ZONE（America/Chicago）へ
 * 変換して `isoformat()` する。よって出力は Chicago オフセット付き（UTC/Z ではない）。
 *
 * DB からは `to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF')`（セッション tz=Chicago）で
 * "2026-04-18T08:41:45.469182-05" のように取得し、オフセットが ±HH だけなら ":00" を補う
 * （Python isoformat は "-05:00" 形式）。Chicago は常に whole-hour。
 */
export const APP_TIMEZONE = "America/Chicago";

export function normalizeDrfDatetime(fromPg: string): string {
  // 末尾が "±HH"（分が無い）なら ":00" を補完
  return /[+-]\d{2}$/.test(fromPg) ? `${fromPg}:00` : fromPg;
}
