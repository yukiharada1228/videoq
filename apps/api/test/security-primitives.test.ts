import { afterEach, describe, expect, it, vi } from "vitest";
import { checkoutIntegrationIdentifier } from "../src/features/billing/stripe";
import { createR2MultipartUpload, presignR2Put } from "../src/integrations/media";
import { stripTrailingSlashes } from "../src/lib/url";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("URL normalization", () => {
  it("preserves internal slashes and handles long failing suffixes", () => {
    expect(stripTrailingSlashes("https://example.test/a///")).toBe("https://example.test/a");
    expect(stripTrailingSlashes("///")).toBe("");
    expect(stripTrailingSlashes("")).toBe("");
    const url = `https://example.test/${"/".repeat(250_000)}end`;
    expect(stripTrailingSlashes(url)).toBe(url);
    expect(stripTrailingSlashes(`${url}///`)).toBe(url);
  });
});

describe("checkout identifiers", () => {
  it("rejects out-of-alphabet samples and refills without modulo bias", () => {
    const random = vi.spyOn(crypto, "getRandomValues")
      .mockImplementationOnce(bytes => { (bytes as Uint8Array).fill(255); return bytes; })
      .mockImplementationOnce(bytes => {
        (bytes as Uint8Array).set([26, 27, 28, 29, 30, 31, 0, 1, 2, 3, 4, 5, 24, 25, 26, 31]);
        return bytes;
      });
    expect(checkoutIntegrationIdentifier()).toBe("videoq-checkout-abcdefyz");
    expect(random).toHaveBeenCalledTimes(2);
  });

  it("retains Stripe's eight-letter suffix", () => {
    expect(checkoutIntegrationIdentifier()).toMatch(/^videoq-checkout-[a-z]{8}$/);
  });
});

describe("S3 multipart upload IDs", () => {
  const env = {
    USE_S3_STORAGE: "true", R2_ACCESS_KEY_ID: "test", R2_SECRET_ACCESS_KEY: "test",
    R2_BUCKET_NAME: "bucket", R2_S3_ENDPOINT: "https://storage.example.test///",
  } as never;

  it("normalizes the configured endpoint before signing", async () => {
    const signed = new URL(await presignR2Put(env, "clip.mp4", "video/mp4", 1));
    expect(signed.pathname).toBe("/bucket/media/clip.mp4");
  });

  it("decodes each XML entity once and preserves nested entity text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      "<InitiateMultipartUploadResult><UploadId>a&amp;lt;b&amp;quot;c&lt;&gt;&quot;&apos;&amp;</UploadId></InitiateMultipartUploadResult>",
    )));
    expect(await createR2MultipartUpload(env, "clip.mp4", "video/mp4"))
      .toBe('a&lt;b&quot;c<>"\'&');
  });
});
