import { describe, expect, it } from "vitest";
import { loggablePath, redactLogPath } from "../src/shared/log-path";

describe("redactLogPath", () => {
  it("招待トークンをログに残さない", () => {
    expect(redactLogPath("/api/videos/course-invitations/abc123SECRET")).toBe(
      "/api/videos/course-invitations/[redacted]",
    );
  });

  it("承認・辞退の末尾セグメントは残す", () => {
    expect(
      redactLogPath("/api/videos/course-invitations/abc123SECRET/accept"),
    ).toBe("/api/videos/course-invitations/[redacted]/accept");
    expect(
      redactLogPath("/api/videos/course-invitations/abc123SECRET/decline"),
    ).toBe("/api/videos/course-invitations/[redacted]/decline");
  });

  it("Better Auth のパスワード再設定トークンを伏せる", () => {
    expect(redactLogPath("/api/auth/reset-password/tok_SECRET")).toBe(
      "/api/auth/reset-password/[redacted]",
    );
  });

  it("トークンを含まないパスはそのまま通す", () => {
    expect(redactLogPath("/api/videos/12/participants")).toBe(
      "/api/videos/12/participants",
    );
    // 招待一覧・失効はトークンではなく ID なので伏せない。
    expect(redactLogPath("/api/videos/12/invitations/34/resend")).toBe(
      "/api/videos/12/invitations/34/resend",
    );
  });
});

describe("loggablePath", () => {
  it("クエリ文字列ごと捨てて、パスのトークンは伏せる", () => {
    expect(
      loggablePath("https://videoq.jp/api/auth/reset-password/SECRET?x=1"),
    ).toBe("/api/auth/reset-password/[redacted]");
    expect(loggablePath("https://videoq.jp/api/auth/verify-email?token=SECRET")).toBe(
      "/api/auth/verify-email",
    );
  });
});
