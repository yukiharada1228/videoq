import { SignJWT, jwtVerify } from "jose";
import type { Bindings } from "../types/bindings";

const ACCESS_LIFETIME_SEC = 10 * 60;
const AUDIENCE = "videoq-api";

function signingKey(env: Bindings): Uint8Array {
  if (!env.AUTH_JWT_SECRET) {
    throw new Error("AUTH_JWT_SECRET is not configured");
  }
  return new TextEncoder().encode(env.AUTH_JWT_SECRET);
}

export async function issueAccessToken(
  env: Bindings,
  userId: number,
  sessionId: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(userId))
    .setIssuer(env.AUTH_ISSUER ?? "videoq")
    .setAudience(AUDIENCE)
    .setJti(crypto.randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_LIFETIME_SEC)
    .sign(signingKey(env));
}

export async function verifyAccessToken(
  env: Bindings,
  token: string,
): Promise<{ userId: number; sessionId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, signingKey(env), {
      algorithms: ["HS256"],
      issuer: env.AUTH_ISSUER ?? "videoq",
      audience: AUDIENCE,
    });
    const userId = Number(payload.sub);
    if (!Number.isSafeInteger(userId) || typeof payload.sid !== "string") return null;
    return { userId, sessionId: payload.sid };
  } catch {
    return null;
  }
}
