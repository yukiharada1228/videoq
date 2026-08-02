import { describe, it, expect } from "vitest";
import { fernetEncrypt, fernetDecrypt } from "../src/lib/fernet";

// 実 Python cryptography.fernet で生成した固定ベクトル。
// SECRET_KEY="fixed-test-secret-123" → PBKDF2(480000, "videoq-user-secret-key") の鍵、
// plaintext="sa_secret_key_123", timestamp=800000000, iv=bytes(range(16))。
const ENV = { JWT_SECRET: "fixed-test-secret-123" } as unknown as Record<string, unknown>;
const IV = new Uint8Array(Array.from({ length: 16 }, (_, i) => i));
const PLAINTEXT = "sa_secret_key_123";
const TOKEN =
  "gAAAAAAvrwgAAAECAwQFBgcICQoLDA0ODzGA5GDhiGzjvNQQ1j9z0uMeHANbbbPfqE5WxIAvceGxE4nc35g1ATeVKkhWSDR34U22Snl5HZj0VP6iV609lbw=";

describe("FernetCipher 互換（Django infrastructure/common/cipher.py）", () => {
  it("実 Python の token と byte 一致", async () => {
    const token = await fernetEncrypt(ENV as never, PLAINTEXT, 800000000, IV);
    expect(token).toBe(TOKEN);
  });

  it("Python が作った token を復号できる", async () => {
    expect(await fernetDecrypt(ENV as never, TOKEN)).toBe(PLAINTEXT);
  });

  it("ランダム IV でも round-trip する", async () => {
    const token = await fernetEncrypt(ENV as never, "another-key");
    expect(await fernetDecrypt(ENV as never, token)).toBe("another-key");
  });

  it("HMAC 不一致（改竄・別鍵）は null", async () => {
    // 暗号文の途中を 1 文字変える（末尾はパディングで潰れる場合がある）
    const at = 40;
    const tampered = `${TOKEN.slice(0, at)}${TOKEN[at] === "A" ? "B" : "A"}${TOKEN.slice(at + 1)}`;
    expect(await fernetDecrypt(ENV as never, tampered)).toBe(null);
    expect(
      await fernetDecrypt({ JWT_SECRET: "other-secret" } as never, TOKEN),
    ).toBe(null);
  });

  it("形式不正は null", async () => {
    expect(await fernetDecrypt(ENV as never, "")).toBe(null);
    expect(await fernetDecrypt(ENV as never, "not-a-token")).toBe(null);
  });
});
