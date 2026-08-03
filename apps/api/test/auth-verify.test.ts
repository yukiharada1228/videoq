import { describe, it, expect } from "vitest";
import { authRoutes } from "../src/routes/auth";

const ENV = { ENVIRONMENT: "development", JWT_SECRET: "s" } as unknown as Record<string, unknown>;

describe("PATCH email-verifications / password-resets（DB 到達前の分岐）", () => {
  it("不正 uid の email 検証 → 400 Invalid or expired verification link.", async () => {
    const res = await authRoutes.request(
      "/email-verifications/!!!/anytoken",
      { method: "PATCH" },
      ENV,
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.message).toBe("Invalid or expired verification link.");
  });

  it("password reset: new_password 欠落 → 400 required（uid/token 検証より前）", async () => {
    const res = await authRoutes.request(
      "/password-resets/NDI/sometoken",
      { method: "PATCH", headers: { "content-type": "application/json" }, body: "{}" },
      ENV,
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.fields.new_password).toEqual(["This field is required."]);
  });

  it("password reset: 8 文字未満 → 400 min_length（validate_password より前）", async () => {
    const res = await authRoutes.request(
      "/password-resets/NDI/sometoken",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ new_password: "short" }),
      },
      ENV,
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.fields.new_password).toEqual([
      "Ensure this field has at least 8 characters.",
    ]);
  });

  it("password reset: 弱いが 8+ の password → validate_password が走る", async () => {
    const res = await authRoutes.request(
      "/password-resets/NDI/sometoken",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ new_password: "password" }),
      },
      ENV,
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.fields.new_password).toEqual(["This password is too common."]);
  });
});
