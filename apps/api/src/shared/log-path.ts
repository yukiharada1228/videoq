/**
 * ログ用のパス正規化（要件 SEC-9: トークン・個人情報をログに出さない）。
 *
 * 招待トークンやパスワード再設定トークンはパスセグメントに載るため、
 * 素の `pathname` を記録すると保持期間の長いアクセスログに秘密が残り、
 * ログ閲覧権限だけでグループ参加やパスワード変更ができてしまう。
 */
const TOKEN_SEGMENT_PATTERNS: readonly RegExp[] = [
  // 招待プレビュー / 承認 / 辞退（`/group-invitations/{token}[/accept|/decline]`）
  /(\/group-invitations\/)[^/]+/g,
  // Better Auth のパスワード再設定コールバック（`/reset-password/{token}`）
  /(\/reset-password\/)[^/]+/g,
  // Better Auth のメール確認コールバック（パス形式で来た場合）
  /(\/verify-email\/)[^/]+/g,
];

export const REDACTED_SEGMENT = "[redacted]";

/** パス内のトークンセグメントを伏せた、ログに残してよい形へ変換する。 */
export function redactLogPath(pathname: string): string {
  let redacted = pathname;
  for (const pattern of TOKEN_SEGMENT_PATTERNS) {
    redacted = redacted.replace(pattern, `$1${REDACTED_SEGMENT}`);
  }
  return redacted;
}

/** リクエスト URL から、ログに残してよいパスだけを取り出す（クエリは捨てる）。 */
export function loggablePath(url: string): string {
  return redactLogPath(new URL(url).pathname);
}
