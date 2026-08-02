/**
 * Django 互換の CSRF トークン検証（codex が Django 6.0.7 csrf.py で検証済みの仕様）。
 * Cookie(csrftoken) / X-CSRFToken はそれぞれ「32文字 secret」または「64文字 masked token」。
 * 両者を 32文字 secret に正規化し、定数時間比較する。trim/正規化はしない（Django と同じ）。
 */
const CSRF_SECRET_LENGTH = 32;
const CSRF_TOKEN_LENGTH = 64;
const CSRF_ALLOWED_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"; // 62
const VALID = /^[a-zA-Z0-9]+$/;

function hasValidFormat(v: string): boolean {
  return (
    (v.length === CSRF_SECRET_LENGTH || v.length === CSRF_TOKEN_LENGTH) &&
    VALID.test(v)
  );
}

function unmask(token: string): string {
  const mask = token.slice(0, CSRF_SECRET_LENGTH);
  const cipher = token.slice(CSRF_SECRET_LENGTH);
  const n = CSRF_ALLOWED_CHARS.length; // 62
  let secret = "";
  for (let i = 0; i < CSRF_SECRET_LENGTH; i += 1) {
    const ci = CSRF_ALLOWED_CHARS.indexOf(cipher[i]);
    const mi = CSRF_ALLOWED_CHARS.indexOf(mask[i]);
    if (ci < 0 || mi < 0) throw new TypeError("invalid csrf char");
    secret += CSRF_ALLOWED_CHARS[(ci - mi + n) % n];
  }
  return secret;
}

function normalize(v: string): string | undefined {
  if (!hasValidFormat(v)) return undefined;
  return v.length === CSRF_TOKEN_LENGTH ? unmask(v) : v;
}

// 定数時間比較（正規化後の secret は ASCII 英数字のみ・等長）。
// workerd の crypto.subtle.timingSafeEqual に依存せず、Node/workerd 両対応の手動実装。
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false; // 正規化後は常に 32
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** 新しい 32 文字 secret を生成（get_random_string 相当・モジュロバイアス回避）。 */
export function generateCsrfSecret(): string {
  const n = CSRF_ALLOWED_CHARS.length; // 62
  const limit = Math.floor(256 / n) * n; // 248: 均等サンプリング用の閾値
  let out = "";
  while (out.length < CSRF_SECRET_LENGTH) {
    const bytes = new Uint8Array(CSRF_SECRET_LENGTH);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < bytes.length && out.length < CSRF_SECRET_LENGTH; i += 1) {
      if (bytes[i] < limit) out += CSRF_ALLOWED_CHARS[bytes[i] % n];
    }
  }
  return out;
}

/** secret を新しい mask でマスクして 64 文字 token を得る（_mask_cipher_secret 相当）。 */
export function maskCsrfSecret(secret: string): string {
  const mask = generateCsrfSecret();
  const n = CSRF_ALLOWED_CHARS.length;
  let cipher = "";
  for (let i = 0; i < CSRF_SECRET_LENGTH; i += 1) {
    const si = CSRF_ALLOWED_CHARS.indexOf(secret[i]);
    const mi = CSRF_ALLOWED_CHARS.indexOf(mask[i]);
    cipher += CSRF_ALLOWED_CHARS[(si + mi) % n];
  }
  return mask + cipher;
}

/**
 * get_token 相当。既存 cookie の secret を再利用（64 文字なら unmask）、無ければ新規生成。
 * cookie に格納する `secret`（32 文字, CSRF_COOKIE_MASKED=False 既定）と、
 * body/ヘッダ用の `token`（毎回新しい 64 文字マスク）を返す。
 */
export function issueCsrfToken(cookieToken: string | undefined): {
  secret: string;
  token: string;
} {
  let secret: string | undefined;
  if (cookieToken !== undefined) secret = normalize(cookieToken);
  if (secret === undefined) secret = generateCsrfSecret();
  return { secret, token: maskCsrfSecret(secret) };
}

/** Django _check_token 相当（cookie secret == header secret）。 */
export function verifyDjangoCsrfToken(
  cookieToken: string | undefined,
  headerToken: string | undefined,
): boolean {
  if (cookieToken === undefined || headerToken === undefined) return false;
  const cookieSecret = normalize(cookieToken);
  if (cookieSecret === undefined) return false;
  const requestSecret = normalize(headerToken);
  if (requestSecret === undefined) return false;
  return constantTimeEqual(requestSecret, cookieSecret);
}
