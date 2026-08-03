import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import { authRoutes } from "../src/routes/auth";

const SECRET = "test-jwt-secret-apikeys";
const ENV = {
  ENVIRONMENT: "development",
  JWT_SECRET: SECRET,
} as unknown as Record<string, unknown>;

async function accessToken(userId = 5) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ token_type: "access", user_id: userId, jti: "j" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(new TextEncoder().encode(SECRET));
}

async function postCreate(body: string, token?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["authorization"] = `Bearer ${token}`;
  return authRoutes.request("/api-keys", { method: "POST", headers, body }, ENV);
}

describe("api-keys management", () => {
  it("GET /api-keys 認証なし → 401", async () => {
    const res = await authRoutes.request("/api-keys", { method: "GET" }, ENV);
    expect(res.status).toBe(401);
  });

  it("POST 認証なし → 401", async () => {
    const res = await postCreate(JSON.stringify({ name: "k" }));
    expect(res.status).toBe(401);
  });

  it("POST name 欠落 → 400 required（DB 到達前）", async () => {
    const res = await postCreate(JSON.stringify({}), await accessToken());
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.fields.name).toEqual(["This field is required."]);
  });

  it("POST name 空白のみ → 400 blank", async () => {
    const res = await postCreate(JSON.stringify({ name: "   " }), await accessToken());
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.fields.name).toEqual(["This field may not be blank."]);
  });

  it("POST access_level 不正 → 400 invalid choice", async () => {
    const res = await postCreate(
      JSON.stringify({ name: "k", access_level: "admin" }),
      await accessToken(),
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.fields.access_level).toEqual(['"admin" is not a valid choice.']);
  });
});
