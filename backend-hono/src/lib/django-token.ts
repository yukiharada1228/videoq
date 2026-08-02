import type { Bindings } from "../types/bindings";

/**
 * Django `default_token_generator`（PasswordResetTokenGenerator）互換のトークン生成。
 * email 検証 / password reset のリンクに使う。検証側（Django の check_token）が
 * そのまま受理できるよう、アルゴリズム・SECRET_KEY・hash value・[::2]・base36 を厳密再現。
 *
 * token = "{ts_b36}-{hmac_hex[::2]}"
 *   ts        = int((now - 2001-01-01 UTC).total_seconds())  ※本番 OS は UTC 前提
 *   hash_val  = f"{pk}{password}{login_ts}{ts}{email}"（login_ts は last_login=None なら ""）
 *   key       = sha256(key_salt + secret)
 *   hmac      = HMAC-SHA256(key, hash_val).hexdigest()[::2]
 */
const KEY_SALT = "django.contrib.auth.tokens.PasswordResetTokenGenerator";
const EPOCH_2001_SEC = Date.UTC(2001, 0, 1) / 1000;
const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";

function intToBase36(value: number): string {
  if (value === 0) return "0";
  let n = value;
  let out = "";
  while (n > 0) {
    out = BASE36[n % 36] + out;
    n = Math.floor(n / 36);
  }
  return out;
}

async function saltedHmacSha256HexEveryOther(
  keySalt: string,
  value: string,
  secret: string,
): Promise<string> {
  const enc = new TextEncoder();
  // key = sha256(key_salt + secret).digest()
  const keyBytes = await crypto.subtle.digest("SHA-256", enc.encode(keySalt + secret));
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(value)));
  // hexdigest()[::2]（1文字おき）
  let out = "";
  for (let i = 0; i < sig.length; i += 1) {
    const hex = sig[i].toString(16).padStart(2, "0");
    out += hex[0]; // 各バイトの上位 nibble が hexdigest の偶数インデックス
  }
  return out;
}

export type TokenUser = {
  pk: number;
  password: string; // 現在のパスワードハッシュ全体
  email: string;
  lastLogin?: string | null; // last_login が None 以外なら str(replace(microsecond=0, tzinfo=None))
  pendingEmail?: string | null; // "email-change" 派生でのみ使う
};

/**
 * `default` = `PasswordResetTokenGenerator`（検証 / パスワード再設定）。
 * `email-change` = `EmailChangeTokenGenerator`（hash value 末尾に pending_email を連結する派生。
 * key_salt は親クラスの定数を継承するので同一）。
 */
export type TokenVariant = "default" | "email-change";

function hashValue(user: TokenUser, ts: number, variant: TokenVariant): string {
  const loginTs = user.lastLogin ?? "";
  const base = `${user.pk}${user.password}${loginTs}${ts}${user.email}`;
  return variant === "default" ? base : `${base}${user.pendingEmail ?? ""}`;
}

/** urlsafe_base64_encode(force_bytes(pk))（パディング無し）。 */
export function encodePkToUid(pk: number): string {
  return btoa(String(pk)) // force_bytes(pk) = str(pk).encode()
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * urlsafe_base64_decode(uidb64) → force_str → int（pk）。Django get(pk=uid) 相当。
 * 不正/非整数は null（Django は例外を握って None）。
 */
export function decodeUidToPk(uidb64: string): number | null {
  try {
    let b64 = uidb64.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const decoded = atob(b64); // 例: "42"
    if (!/^\d+$/.test(decoded)) return null;
    const n = Number(decoded);
    return Number.isSafeInteger(n) ? n : null;
  } catch {
    return null;
  }
}

// _make_token_with_timestamp(user, ts, secret) 相当。
async function makeTokenWithTimestamp(
  env: Bindings,
  user: TokenUser,
  ts: number,
  variant: TokenVariant,
): Promise<string> {
  if (!env.JWT_SECRET) throw new Error("JWT_SECRET is not configured"); // fail-closed（トークン偽造防止）
  const hash = await saltedHmacSha256HexEveryOther(
    KEY_SALT,
    hashValue(user, ts, variant),
    env.JWT_SECRET,
  );
  return `${intToBase36(ts)}-${hash}`;
}

/** default_token_generator.make_token(user) 相当。nowSec を渡すとその時刻で生成（テスト用）。 */
export async function makeDjangoToken(
  env: Bindings,
  user: TokenUser,
  nowSec: number = Math.floor(Date.now() / 1000),
  variant: TokenVariant = "default",
): Promise<string> {
  return makeTokenWithTimestamp(env, user, Math.floor(nowSec - EPOCH_2001_SEC), variant);
}

/** email_change_token_generator.make_token(user) 相当（pending_email 必須）。 */
export function makeEmailChangeToken(
  env: Bindings,
  user: TokenUser,
  nowSec?: number,
): Promise<string> {
  return makeDjangoToken(env, user, nowSec, "email-change");
}

const PASSWORD_RESET_TIMEOUT = 60 * 60 * 24 * 3; // settings 既定 3 日

function base36ToInt(s: string): number | null {
  if (s.length === 0 || s.length > 13 || !/^[0-9a-z]+$/i.test(s)) return null;
  const n = parseInt(s, 36);
  return Number.isSafeInteger(n) ? n : null;
}

function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * default_token_generator.check_token(user, token) 相当。
 * token を分解 → ts で再計算して定数時間比較 → PASSWORD_RESET_TIMEOUT(3日) 以内か。
 */
export async function checkDjangoToken(
  env: Bindings,
  user: TokenUser,
  token: string,
  nowSec: number = Math.floor(Date.now() / 1000),
  variant: TokenVariant = "default",
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split("-");
  if (parts.length !== 2) return false; // "ts-hash" ちょうど 2 分割（Django も同様）
  const ts = base36ToInt(parts[0]);
  if (ts === null) return false;

  const expected = await makeTokenWithTimestamp(env, user, ts, variant);
  if (!constantTimeCompare(expected, token)) return false;

  const nowTs = Math.floor(nowSec - EPOCH_2001_SEC);
  if (nowTs - ts > PASSWORD_RESET_TIMEOUT) return false;
  return true;
}

/** email_change_token_generator.check_token(user, token) 相当（有効期限も 3 日で共通）。 */
export function checkEmailChangeToken(
  env: Bindings,
  user: TokenUser,
  token: string,
  nowSec?: number,
): Promise<boolean> {
  return checkDjangoToken(env, user, token, nowSec, "email-change");
}
