import { describe, expect, it } from "vitest";
import {
  decryptUserSecret,
  encryptUserSecret,
} from "../src/lib/secret-encryption";
import type { Bindings } from "../src/types/bindings";

const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/, "");
const env = { USER_SECRET_ENCRYPTION_KEY: key } as Bindings;

describe("user secret encryption", () => {
  it("round-trips a versioned AES-GCM envelope", async () => {
    const encrypted = await encryptUserSecret(env, "search-api-key");
    expect(encrypted).toMatch(/^v1\.[^.]+\.[^.]+$/);
    expect(await decryptUserSecret(env, encrypted)).toBe("search-api-key");
  });

  it("rejects tampered values", async () => {
    const encrypted = await encryptUserSecret(env, "search-api-key");
    expect(await decryptUserSecret(env, `${encrypted}x`)).toBeNull();
  });
});
