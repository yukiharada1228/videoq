import { SignJWT } from "jose";
import { TEST_AUTH_SESSION_ID } from "./pg-fake";

export { TEST_AUTH_SESSION_ID };

export async function signAccessToken(
  secret: string,
  userId = 5,
  issuer = "videoq",
  sessionId = TEST_AUTH_SESSION_ID,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(userId))
    .setIssuer(issuer)
    .setAudience("videoq-api")
    .setIssuedAt(now)
    .setExpirationTime(now + 600)
    .sign(new TextEncoder().encode(secret));
}
