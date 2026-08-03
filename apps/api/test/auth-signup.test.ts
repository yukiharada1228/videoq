import { describe, it, expect } from "vitest";
import { authRoutes } from "../src/features/auth/routes";
import { buildVerificationLink } from "../src/lib/auth-email";

const ENV = {
  ENVIRONMENT: "development",
  AUTH_JWT_SECRET: "test-secret",
  FRONTEND_URL: "https://app.videoq.test",
} as unknown as Record<string, unknown>;

function post(body: string, ct = "application/json") {
  return authRoutes.request(
    "/api/auth/users",
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
    expect(j.error.details.username).toEqual(["Invalid input: expected string, received undefined"]);
    expect(j.error.details.email).toEqual(["Invalid input: expected string, received undefined"]);
    expect(j.error.details.password).toEqual(["Invalid input: expected string, received undefined"]);
  });

  it("不正 email → 400", async () => {
    const res = await post(JSON.stringify({ username: "u", email: "bad", password: "Str0ng!Pass-xyz" }));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.details.email).toEqual(["Enter a valid email address."]);
  });

  it("数字のみの password → 400", async () => {
    const res = await post(JSON.stringify({ username: "u", email: "a@b.co", password: "123456789012" }));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.details.password).toEqual(["Password cannot contain only numbers."]);
  });
});

describe("buildVerificationLink", () => {
  it("opaque token を含む正しい形", () => {
    const link = buildVerificationLink(ENV as never, "verify-token");
    expect(link).toBe("https://app.videoq.test/verify-email?token=verify-token");
  });
});
