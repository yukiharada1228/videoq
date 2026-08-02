import { describe, it, expect } from "vitest";
import { verifyDjangoCsrfToken } from "../src/utils/csrf";
import { isScopeAllowed } from "../src/middleware/auth";
import { buildCeleryJobMessage, payloadSha256 } from "../src/lib/jobs";

// 実 Django 6.0.7 が発行した CSRF トークン（同一 secret の masked×2 + 別 secret）。
const V = {
  secret: "2xLpsQfSDqhsiIkfKd1s1CIYeFwIvvh9",
  masked1:
    "ttXYkepXNMQCElhb45sHjm3P3xXcsGj5lQydCUuFg2XUMTrgE8jZaOBD72jKN1q4",
  masked2:
    "shFW1InZxBbzCvb97ItjpPjoyQ5lX6LgkEgbjosH0RiRK3leHLkBghRcClrTirSf",
  other_secret: "5TKgYo2oprGKiXBmnwzcQRiTu9dgKFKm",
  other_masked:
    "XelAHM8ubmivkRMRouLZ5JNvIIa78tlUSXVGv00IqDO5sEd3BQa1LqVe2HddIYV6",
};

describe("CSRF (Django 互換)", () => {
  it("同一 secret の組み合わせは全て有効（32/32, 32/64, 64/64, 64/32）", () => {
    expect(verifyDjangoCsrfToken(V.secret, V.secret)).toBe(true);
    expect(verifyDjangoCsrfToken(V.secret, V.masked1)).toBe(true);
    expect(verifyDjangoCsrfToken(V.masked1, V.masked2)).toBe(true);
    expect(verifyDjangoCsrfToken(V.masked1, V.secret)).toBe(true);
  });
  it("別 secret / 欠落 / 不正形式は拒否", () => {
    expect(verifyDjangoCsrfToken(V.secret, V.other_secret)).toBe(false);
    expect(verifyDjangoCsrfToken(V.secret, V.other_masked)).toBe(false);
    expect(verifyDjangoCsrfToken(V.masked1, V.other_masked)).toBe(false);
    expect(verifyDjangoCsrfToken(undefined, V.secret)).toBe(false);
    expect(verifyDjangoCsrfToken(V.secret, undefined)).toBe(false);
    expect(verifyDjangoCsrfToken(V.secret, "short")).toBe(false);
    expect(verifyDjangoCsrfToken(V.secret, V.secret + "!")).toBe(false);
  });
});

describe("API キースコープ（ApiKeyScopePermission 相当）", () => {
  it("all は全許可、read_only は {read, chat_write} のみ", () => {
    expect(isScopeAllowed("all", "read")).toBe(true);
    expect(isScopeAllowed("all", "write")).toBe(true);
    expect(isScopeAllowed("all", "chat_write")).toBe(true);
    expect(isScopeAllowed("read_only", "read")).toBe(true);
    expect(isScopeAllowed("read_only", "chat_write")).toBe(true);
    expect(isScopeAllowed("read_only", "write")).toBe(false);
    expect(isScopeAllowed("unknown", "read")).toBe(false);
  });
});

describe("ジョブ投入（Celery 互換メッセージ）", () => {
  it("最小メッセージを生成し body は base64(json([args,kwargs,embed]))", () => {
    const m = buildCeleryJobMessage(
      "app.entrypoints.tasks.transcription.transcribe_video",
      [123],
      "fixed-job-id",
    );
    expect(m.headers.task).toContain("transcribe_video");
    expect(m.headers.id).toBe("fixed-job-id");
    const decoded = JSON.parse(atob(m.body));
    expect(decoded).toEqual([[123], {}, {}]);
  });
  it("payloadSha256 は同一入力で安定", async () => {
    const a = await payloadSha256("t", [1], { k: 2 });
    const b = await payloadSha256("t", [1], { k: 2 });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });
});
