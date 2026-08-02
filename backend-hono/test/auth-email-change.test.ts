import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import { authRoutes } from "../src/routes/auth";
import { buildPasswordResetLink, buildEmailChangeLink } from "../src/lib/auth-email";

const SECRET = "test-email-change-secret";
const ENV = {
  ENVIRONMENT: "development",
  JWT_SECRET: SECRET,
  FRONTEND_URL: "https://app.videoq.test",
} as unknown as Record<string, unknown>;

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ token_type: "access", user_id: 5, jti: "j" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(new TextEncoder().encode(SECRET));
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
      "/password-resets",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      ENV,
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.fields.email).toEqual(["This field is required."]);
  });

  it("不正な email → 400 EmailField", async () => {
    const res = await authRoutes.request(
      "/password-resets",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "not-an-email" }),
      },
      ENV,
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.fields.email).toEqual(["Enter a valid email address."]);
  });

  it("null は blank ではなく null エラー", async () => {
    const res = await authRoutes.request(
      "/password-resets",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: null }),
      },
      ENV,
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.fields.email).toEqual(["This field may not be null."]);
  });
});

describe("PATCH /me/email（DB 到達前の分岐）", () => {
  it("認証なし → 401", async () => {
    const res = await authRoutes.request("/me/email", { method: "PATCH" }, ENV);
    expect(res.status).toBe(401);
  });

  it("認証あり + email 欠落 → 400 required", async () => {
    const res = await authRoutes.request("/me/email", await jsonPatch({}), ENV);
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.fields.email).toEqual(["This field is required."]);
  });

  it("認証あり + 不正 email → 400 EmailField", async () => {
    const res = await authRoutes.request("/me/email", await jsonPatch({ email: "nope" }), ENV);
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.fields.email).toEqual(["Enter a valid email address."]);
  });
});

describe("PATCH /email-change/:uidb64/:token（DB 到達前の分岐）", () => {
  it("不正 uid → 400 Invalid or expired email change link.", async () => {
    const res = await authRoutes.request(
      "/email-change/!!!/anytoken",
      { method: "PATCH" },
      ENV,
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.message).toBe("Invalid or expired email change link.");
  });
});

describe("メールリンクの組み立て", () => {
  const user = {
    pk: 42,
    passwordHash: "pbkdf2_sha256$1200000$saltsaltsalt$hashhashhash",
    email: "old@example.com",
    lastLogin: "2026-08-01 15:30:45",
  };

  it("reset-password リンクは uid/token 付き", async () => {
    const link = await buildPasswordResetLink(ENV as never, user);
    expect(link).toMatch(
      /^https:\/\/app\.videoq\.test\/reset-password\?uid=NDI&token=[0-9a-z]+-[0-9a-f]{32}$/,
    );
  });

  it("change-email リンクは pending_email 込みのトークン", async () => {
    const link = await buildEmailChangeLink(ENV as never, {
      ...user,
      pendingEmail: "new@example.com",
    });
    expect(link).toMatch(
      /^https:\/\/app\.videoq\.test\/change-email\?uid=NDI&token=[0-9a-z]+-[0-9a-f]{32}$/,
    );
    const other = await buildEmailChangeLink(ENV as never, {
      ...user,
      pendingEmail: "another@example.com",
    });
    expect(link).not.toBe(other);
  });
});
