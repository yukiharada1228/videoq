import { describe, expect, it } from "vitest";
import { createDecipheriv } from "node:crypto";
import { encryptUserSecret } from "../src/lib/secret-encryption";
import type { Bindings } from "../src/types/bindings";

const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/, "");
const env = { USER_SECRET_ENCRYPTION_KEY: key } as Bindings;

// Verify the wire format with Node's crypto rather than a second API implementation.
function decryptEnvelope(envelope: string): string {
  const [, nonce, payload] = envelope.split(".");
  const ciphertext = Buffer.from(payload, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", Buffer.alloc(32, 7), Buffer.from(nonce, "base64url"));
  decipher.setAuthTag(ciphertext.subarray(-16));
  return Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]).toString("utf8");
}

describe("user secret encryption", () => {
  it("round-trips a versioned AES-GCM envelope", async () => {
    const encrypted = await encryptUserSecret(env, "search-api-key");
    expect(encrypted).toMatch(/^v1\.[^.]+\.[^.]+$/);
    expect(decryptEnvelope(encrypted)).toBe("search-api-key");
  });

  it("rejects tampered values", async () => {
    const encrypted = await encryptUserSecret(env, "search-api-key");
    const [version, nonce, payload] = encrypted.split(".");
    const tampered = Buffer.from(payload, "base64url");
    tampered[0] ^= 1;
    expect(() => decryptEnvelope(`${version}.${nonce}.${tampered.toString("base64url")}`)).toThrow();
  });
});
