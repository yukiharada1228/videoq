import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { readFocusFrames } from "../../src/lib/focus-frames";
import { readMediaRange } from "../../src/integrations/media";
import { focusCacheFixture } from "../helpers/focus-cache";
import type { Bindings } from "../../src/types/bindings";

it("reads the dense cache through real workerd R2 range and conditional APIs", async () => {
  const fileKey = `test/focus-${crypto.randomUUID()}`;
  const key = `media/${fileKey}.focus-v1.bin`;
  const bindings = { ...env, ENVIRONMENT: "production" } as Bindings;
  try {
    await env.VIDEO_BUCKET.put(key, focusCacheFixture());
    const result = await readFocusFrames(bindings, { id: 42, fileKey }, 5, 21, new AbortController().signal);
    if (!("frames" in result)) throw new Error("Expected dense frames");
    expect(result.frames.map(f => f.timestamp_seconds)).toEqual(Array.from({ length: 16 }, (_, i) => i + 5));
    const old = await readMediaRange(bindings, `${fileKey}.focus-v1.bin`, 0, 12);
    await env.VIDEO_BUCKET.put(key, focusCacheFixture([1000, 2000]));
    expect(await readMediaRange(bindings, `${fileKey}.focus-v1.bin`, 0, 12, undefined, old!.etag)).toBeNull();
  } finally {
    await env.VIDEO_BUCKET.delete(key);
  }
});
