import { describe, it, expect } from "vitest";
import { verifyDjangoPassword, hashDjangoPassword } from "../src/lib/password";

// 実 Django make_password("TestPass123!@#こんにちは") で生成した固定ハッシュ（pbkdf2_sha256, 1.2M iters）。
const HASH =
  "pbkdf2_sha256$1200000$qWZtltacjK73Spy2uxAFWu$ywnW8qlRCel1qrSubI570/ry17mjRjMVZoZIDcv2sis=";
const PW = "TestPass123!@#こんにちは";

describe("verifyDjangoPassword (pbkdf2_sha256)", () => {
  it("correct password (UTF-8) → true", async () => {
    expect(await verifyDjangoPassword(PW, HASH)).toBe(true);
  });
  it("wrong password → false", async () => {
    expect(await verifyDjangoPassword("wrong", HASH)).toBe(false);
  });
  it("tampered hash → false", async () => {
    expect(await verifyDjangoPassword(PW, HASH.slice(0, -4) + "aaa=")).toBe(false);
  });
  it("unsupported algorithm → false", async () => {
    expect(await verifyDjangoPassword(PW, "bcrypt$12$abc$def")).toBe(false);
  });
  it("malformed encoded → false", async () => {
    expect(await verifyDjangoPassword(PW, "not-a-hash")).toBe(false);
  });
});

describe("hashDjangoPassword (make_password, round-trip)", () => {
  it("生成 → 自 verify で照合成功、フォーマットは Django 準拠", async () => {
    const encoded = await hashDjangoPassword("SignupPass!2026漢字");
    const [algo, iters, salt, hash] = encoded.split("$");
    expect(algo).toBe("pbkdf2_sha256");
    expect(iters).toBe("1200000");
    expect(salt).toHaveLength(22); // Django 128bit エントロピー相当
    expect(hash).toHaveLength(44); // 32 bytes → base64
    expect(await verifyDjangoPassword("SignupPass!2026漢字", encoded)).toBe(true);
    expect(await verifyDjangoPassword("wrong", encoded)).toBe(false);
  });
  it("同じ password でも salt がランダムでハッシュは毎回異なる", async () => {
    const a = await hashDjangoPassword("same");
    const b = await hashDjangoPassword("same");
    expect(a).not.toBe(b);
    expect(await verifyDjangoPassword("same", a)).toBe(true);
    expect(await verifyDjangoPassword("same", b)).toBe(true);
  });
});
