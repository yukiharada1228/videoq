import { describe, it, expect } from "vitest";
import { authRoutes } from "../src/routes/auth";
import { buildVerificationLink } from "../src/lib/auth-email";

const ENV = {
  ENVIRONMENT: "development",
  JWT_SECRET: "test-secret",
  FRONTEND_URL: "https://app.videoq.test",
} as unknown as Record<string, unknown>;

function post(body: string, ct = "application/json") {
  return authRoutes.request(
    "/users",
    { method: "POST", headers: ct ? { "content-type": ct } : {}, body },
    ENV,
  );
}

describe("POST /users signup guards（DB 到達前）", () => {
  it("text/plain → 415", async () => {
    const res = await post(JSON.stringify({ username: "u", email: "a@b.co", password: "x" }), "text/plain");
    expect(res.status).toBe(415);
  });

  it("全欠落 → 400（3 フィールド required）", async () => {
    const res = await post("{}");
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.fields.username).toEqual(["This field is required."]);
    expect(j.error.fields.email).toEqual(["This field is required."]);
    expect(j.error.fields.password).toEqual(["This field is required."]);
  });

  it("不正 email → 400", async () => {
    const res = await post(JSON.stringify({ username: "u", email: "bad", password: "Str0ng!Pass-xyz" }));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.fields.email).toEqual(["Enter a valid email address."]);
  });

  it("弱い password（common+numeric）→ 400 複数メッセージ", async () => {
    const res = await post(JSON.stringify({ username: "u", email: "a@b.co", password: "12345678" }));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.fields.password).toEqual([
      "This password is too common.",
      "This password is entirely numeric.",
    ]);
  });
});

describe("buildVerificationLink", () => {
  it("uid=base64url(pk) と token を含む正しい形", async () => {
    const link = await buildVerificationLink(ENV as never, {
      pk: 42,
      passwordHash: "pbkdf2_sha256$1200000$s$h",
      email: "a@b.co",
    });
    expect(link.startsWith("https://app.videoq.test/verify-email?uid=NDI&token=")).toBe(true);
    const token = new URL(link).searchParams.get("token")!;
    expect(token).toMatch(/^[0-9a-z]+-[0-9a-f]{32}$/);
  });
});
