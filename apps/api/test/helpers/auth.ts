import { SignJWT } from "jose";

export async function signAccessToken(
  secret: string,
  userId = 5,
  issuer = "videoq",
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sid: "test-session" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(userId))
    .setIssuer(issuer)
    .setAudience("videoq-api")
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .sign(new TextEncoder().encode(secret));
}
