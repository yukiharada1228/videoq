import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import { authRoutes } from "../src/routes/auth";

const SECRET = "test-searchapi-secret";
const ENV = { ENVIRONMENT: "development", JWT_SECRET: SECRET } as unknown as Record<
  string,
  unknown
>;

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ token_type: "access", user_id: 5, jti: "j" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(new TextEncoder().encode(SECRET));
}

const put = async (body: unknown) => ({
  method: "PUT",
  headers: {
    authorization: `Bearer ${await accessToken()}`,
    "content-type": "application/json",
  },
  body: JSON.stringify(body),
});

describe("/searchapi-key のガードと serializer（DB 到達前）", () => {
  it("認証なしは 401（GET/PUT/DELETE）", async () => {
    for (const method of ["GET", "PUT", "DELETE"]) {
      const res = await authRoutes.request("/searchapi-key", { method }, ENV);
      expect(res.status, method).toBe(401);
    }
  });

  it("api_key 欠落 → 400 required", async () => {
    const res = await authRoutes.request("/searchapi-key", await put({}), ENV);
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.fields.api_key).toEqual(["This field is required."]);
  });

  it("空文字は CharField の blank エラー", async () => {
    const res = await authRoutes.request("/searchapi-key", await put({ api_key: "" }), ENV);
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.fields.api_key).toEqual(["This field may not be blank."]);
  });

  it("空白のみは trim_whitespace 後に blank 扱い", async () => {
    const res = await authRoutes.request("/searchapi-key", await put({ api_key: "   " }), ENV);
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.fields.api_key).toEqual(["This field may not be blank."]);
  });

  it("null は null エラー", async () => {
    const res = await authRoutes.request("/searchapi-key", await put({ api_key: null }), ENV);
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.fields.api_key).toEqual(["This field may not be null."]);
  });
});
