import { SignJWT, jwtVerify } from "jose";
import type { Bindings } from "../types/bindings";

/**
 * SimpleJWT 互換のトークン発行（HS256, SIGNING_KEY=SECRET_KEY=JWT_SECRET）。
 * claims: { token_type, exp, iat, jti, user_id }（SimpleJWT の RefreshToken()/access_token と一致）。
 * ACCESS 10 分・REFRESH 14 日（settings.SIMPLE_JWT）。
 */
const ACCESS_LIFETIME_SEC = 10 * 60;
const REFRESH_LIFETIME_SEC = 14 * 24 * 60 * 60;

export type TokenPair = { access: string; refresh: string };

async function signToken(
  env: Bindings,
  tokenType: "access" | "refresh",
  userId: number,
  lifetimeSec: number,
  nowSec: number,
): Promise<string> {
  if (!env.JWT_SECRET) throw new Error("JWT_SECRET is not configured"); // fail-closed
  const key = new TextEncoder().encode(env.JWT_SECRET);
  return new SignJWT({
    token_type: tokenType,
    user_id: userId,
    jti: crypto.randomUUID().replace(/-/g, ""), // SimpleJWT の jti は uuid4().hex
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + lifetimeSec)
    .sign(key);
}

/** ユーザーに access/refresh のペアを発行（issue_for_user 相当）。 */
export async function issueTokenPair(
  env: Bindings,
  userId: number,
): Promise<TokenPair> {
  const nowSec = Math.floor(Date.now() / 1000);
  const [access, refresh] = await Promise.all([
    signToken(env, "access", userId, ACCESS_LIFETIME_SEC, nowSec),
    signToken(env, "refresh", userId, REFRESH_LIFETIME_SEC, nowSec),
  ]);
  return { access, refresh };
}

/**
 * refresh トークンを検証（TokenRefreshSerializer 相当の入口）。
 * 署名(HS256)・exp・token_type=refresh・user_id(number) を確認し、user_id を返す。無効は null。
 */
export async function verifyRefreshToken(
  env: Bindings,
  token: string,
): Promise<number | null> {
  try {
    const key = new TextEncoder().encode(env.JWT_SECRET);
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (payload.token_type !== "refresh" || typeof payload.user_id !== "number") {
      return null;
    }
    if (!Number.isSafeInteger(payload.user_id)) return null;
    return payload.user_id;
  } catch {
    return null;
  }
}
