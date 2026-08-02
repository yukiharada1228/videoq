import { describe, it, expect } from "vitest";
import {
  issueCsrfToken,
  generateCsrfSecret,
  maskCsrfSecret,
  verifyDjangoCsrfToken,
} from "../src/utils/csrf";

const ALNUM = /^[a-zA-Z0-9]+$/;

describe("CSRF issuance (Django get_token 互換)", () => {
  it("secret は 32 文字の英数字", () => {
    const s = generateCsrfSecret();
    expect(s).toHaveLength(32);
    expect(ALNUM.test(s)).toBe(true);
  });

  it("mask は 64 文字で、issue した token は同じ secret cookie と照合成功", () => {
    const { secret, token } = issueCsrfToken(undefined);
    expect(secret).toHaveLength(32);
    expect(token).toHaveLength(64);
    // cookie(secret) と header(masked token) が一致すると判定される
    expect(verifyDjangoCsrfToken(secret, token)).toBe(true);
  });

  it("既存 cookie(secret) を渡すと同じ secret を再利用（token は新規マスク）", () => {
    const existing = generateCsrfSecret();
    const { secret, token } = issueCsrfToken(existing);
    expect(secret).toBe(existing);
    expect(token).not.toBe(existing);
    expect(verifyDjangoCsrfToken(secret, token)).toBe(true);
  });

  it("既存 cookie が 64 文字 masked token でも unmask して secret を再利用", () => {
    const s = generateCsrfSecret();
    const masked = maskCsrfSecret(s); // 64 文字
    const { secret } = issueCsrfToken(masked);
    expect(secret).toBe(s);
  });

  it("毎回のマスクは異なる（mask がランダム）", () => {
    const s = generateCsrfSecret();
    expect(maskCsrfSecret(s)).not.toBe(maskCsrfSecret(s));
  });
});
