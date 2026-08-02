import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import { authRoutes } from "../src/routes/auth";

const SECRET = "test-jwt-secret-xyz";
const ENV = {
  ENVIRONMENT: "development",
  JWT_SECRET: SECRET,
} as unknown as Record<string, unknown>;

async function sign(tokenType: "access" | "refresh", userId: number, expDelta = 3600) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ token_type: tokenType, user_id: userId, jti: "abc" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + expDelta)
    .sign(new TextEncoder().encode(SECRET));
}

function postTokens(cookie?: string) {
  const headers: Record<string, string> = {};
  if (cookie) headers["cookie"] = cookie;
  return authRoutes.request("/tokens", { method: "POST", headers }, ENV);
}

describe("POST /tokens refresh", () => {
  it("refresh_token cookie 欠落 → 401 AUTHENTICATION_FAILED", async () => {
    const res = await postTokens();
    expect(res.status).toBe(401);
    const j = await res.json();
    expect(j.error.code).toBe("AUTHENTICATION_FAILED");
    expect(j.error.message).toBe("Invalid refresh token");
  });

  it("access トークンを refresh_token に入れても 401（token_type 不一致）", async () => {
    const access = await sign("access", 5);
    const res = await postTokens(`refresh_token=${access}`);
    expect(res.status).toBe(401);
  });

  it("壊れたトークン → 401", async () => {
    const res = await postTokens("refresh_token=not.a.jwt");
    expect(res.status).toBe(401);
  });

  it("期限切れ refresh → 401", async () => {
    const expired = await sign("refresh", 5, -10);
    const res = await postTokens(`refresh_token=${expired}`);
    expect(res.status).toBe(401);
  });

  it("有効な refresh → 200 {} + 新しい access/refresh cookie を設定", async () => {
    const refresh = await sign("refresh", 5);
    const res = await postTokens(`refresh_token=${refresh}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("access_token=");
    expect(setCookie).toContain("refresh_token=");
    expect(setCookie).toContain("HttpOnly");
  });
});
