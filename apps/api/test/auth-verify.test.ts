import { describe, it, expect, vi } from "vitest";
import { authRoutes } from "../src/features/auth/routes";

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

const ENV = {
  ENVIRONMENT: "development",
  AUTH_JWT_SECRET: "s",
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
} as unknown as Record<string, unknown>;

describe("PATCH email-verifications / password-resets（DB 到達前の分岐）", () => {
  it("不正 token の email 検証 → 400 Invalid or expired verification link.", async () => {
    const res = await authRoutes.request(
      "/api/auth/email-verifications/invalid-token",
      { method: "PATCH" },
      ENV,
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.message).toBe("Invalid or expired verification link.");
  });

  it("password reset: new_password 欠落 → 400 required（uid/token 検証より前）", async () => {
    const res = await authRoutes.request(
      "/api/auth/password-resets/sometoken",
      { method: "PATCH", headers: { "content-type": "application/json" }, body: "{}" },
      ENV,
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.details.new_password).toEqual(["Invalid input: expected string, received undefined"]);
  });

  it("password reset: 12 文字未満 → 400 min_length（validate_password より前）", async () => {
    const res = await authRoutes.request(
      "/api/auth/password-resets/sometoken",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ new_password: "short" }),
      },
      ENV,
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.details.new_password).toEqual([
      "Too small: expected string to have >=12 characters",
    ]);
  });

  it("password reset: 数字のみの 12+ password → validate_password が走る", async () => {
    const res = await authRoutes.request(
      "/api/auth/password-resets/sometoken",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ new_password: "123456789012" }),
      },
      ENV,
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.details.new_password).toEqual(["Password cannot contain only numbers."]);
  });
});
