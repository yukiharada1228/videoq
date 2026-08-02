import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import { authRoutes } from "../src/routes/auth";

const SECRET = "test-account-secret";
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

describe("DELETE /account guards（DB 到達前）", () => {
  it("認証なし → 401", async () => {
    const res = await authRoutes.request("/account", { method: "DELETE" }, ENV);
    expect(res.status).toBe(401);
  });

  it("認証あり + reason=null → 400（reason may not be null）", async () => {
    const res = await authRoutes.request(
      "/account",
      {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${await accessToken()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ reason: null }),
      },
      ENV,
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.fields.reason).toEqual(["This field may not be null."]);
  });
});
