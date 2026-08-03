import { describe, expect, it, vi } from "vitest";
import { jwtVerify } from "jose";
import { authRoutes } from "../src/features/auth/routes";
import { signAccessToken } from "./helpers/auth";

const SECRET = "login-contract-secret";
const ENV = {
  ENVIRONMENT: "development",
  AUTH_JWT_SECRET: SECRET,
} as unknown as Record<string, unknown>;

vi.mock("../src/features/auth/service", () => ({
  login: async () => ({
    ok: true,
    accessToken: await signAccessToken(SECRET),
    refreshToken: "opaque-refresh-token",
  }),
}));

describe("POST /api/auth/sessions response contract", () => {
  it("Bearer access token を body、opaque refresh を cookie で返す", async () => {
    const res = await authRoutes.request(
      "/api/auth/sessions",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "alice", password: "correct-password" }),
      },
      ENV,
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ token_type: "Bearer", expires_in: 600 });
    const { payload, protectedHeader } = await jwtVerify(
      body.access_token,
      new TextEncoder().encode(SECRET),
      { algorithms: ["HS256"], issuer: "videoq", audience: "videoq-api" },
    );
    expect(protectedHeader.alg).toBe("HS256");
    expect(payload).toMatchObject({ sub: "5", sid: "test-session" });
    expect(payload.exp).toBe(payload.iat! + 600);

    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("vq_refresh=opaque-refresh-token");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).not.toContain("access_token=");
  });
});
