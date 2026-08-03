import { describe, it, expect, vi } from "vitest";
import { authRoutes } from "../src/features/auth/routes";
import { buildPasswordResetLink, buildEmailChangeLink } from "../src/lib/auth-email";
import { signAccessToken } from "./helpers/auth";

vi.mock("pg", () => {
  class FakeClient {
    async connect() {}
    async end() {}
    async query() {
      return { rows: [], rowCount: 0 };
    }
  }
  return { default: { Client: FakeClient } };
});

const SECRET = "test-email-change-secret";
const ENV = {
  ENVIRONMENT: "development",
  AUTH_JWT_SECRET: SECRET,
  FRONTEND_URL: "https://app.videoq.test",
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
} as unknown as Record<string, unknown>;

async function accessToken() {
  return signAccessToken(SECRET);
}

const jsonPatch = async (body: unknown) => ({
  method: "PATCH",
  headers: {
    authorization: `Bearer ${await accessToken()}`,
    "content-type": "application/json",
  },
  body: JSON.stringify(body),
});

describe("POST /password-resets（DB 到達前の分岐）", () => {
  it("email 欠落 → 400 required", async () => {
    const res = await authRoutes.request(
      "/api/auth/password-resets",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      ENV,
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.details.email).toEqual(["Invalid input: expected string, received undefined"]);
  });

  it("不正な email → 400 EmailField", async () => {
    const res = await authRoutes.request(
      "/api/auth/password-resets",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "not-an-email" }),
      },
      ENV,
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.details.email).toEqual(["Enter a valid email address."]);
  });

  it("null は blank ではなく null エラー", async () => {
    const res = await authRoutes.request(
      "/api/auth/password-resets",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: null }),
      },
      ENV,
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.details.email).toEqual(["Invalid input: expected string, received null"]);
  });
});

describe("PATCH /me/email（DB 到達前の分岐）", () => {
  it("認証なし → 401", async () => {
    const res = await authRoutes.request("/api/auth/me/email", { method: "PATCH" }, ENV);
    expect(res.status).toBe(401);
  });

  it("認証あり + email 欠落 → 400 required", async () => {
    const res = await authRoutes.request("/api/auth/me/email", await jsonPatch({}), ENV);
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.details.email).toEqual(["Invalid input: expected string, received undefined"]);
  });

  it("認証あり + 不正 email → 400 EmailField", async () => {
    const res = await authRoutes.request("/api/auth/me/email", await jsonPatch({ email: "nope" }), ENV);
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.details.email).toEqual(["Enter a valid email address."]);
  });
});

describe("PATCH /email-change/:token（DB 到達前の分岐）", () => {
  it("不正 token → 400 Invalid or expired email change link.", async () => {
    const res = await authRoutes.request(
      "/api/auth/email-change/invalid-token",
      { method: "PATCH" },
      ENV,
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.message).toBe("Invalid or expired email change link.");
  });
});

describe("メールリンクの組み立て", () => {
  it("reset-password リンクは opaque token 付き", () => {
    const link = buildPasswordResetLink(ENV as never, "reset-token");
    expect(link).toBe("https://app.videoq.test/reset-password?token=reset-token");
  });

  it("change-email リンクは opaque token 付き", () => {
    const link = buildEmailChangeLink(ENV as never, "change-token");
    expect(link).toBe("https://app.videoq.test/change-email?token=change-token");
  });
});
