import { afterEach, expect, it, vi } from "vitest";
import { readMediaBytes, readMediaRange } from "../src/integrations/media";
import type { Bindings } from "../src/types/bindings";

afterEach(() => vi.unstubAllGlobals());
const envFor = (body: ReadableStream<Uint8Array>, size: number) => ({
  ENVIRONMENT: "production", VIDEO_BUCKET: { get: async () => ({ body, size }) },
}) as Bindings;

it("bounds actual streamed bytes even if object metadata is wrong", async () => {
  const canceled = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(11)); }, cancel: canceled,
  });
  await expect(readMediaBytes(envFor(body, 1), "private/cache", 10)).rejects.toThrow("read limit");
  expect(canceled).toHaveBeenCalledOnce();
});
it("rejects oversized metadata without consuming the object", async () => {
  const canceled = vi.fn();
  const body = new ReadableStream<Uint8Array>({ cancel: canceled });
  await expect(readMediaBytes(envFor(body, 11), "private/cache", 10)).rejects.toThrow("read limit");
  expect(canceled).toHaveBeenCalledOnce();
});
it("cancels a stalled body when the chat disconnects", async () => {
  const canceled = vi.fn();
  const body = new ReadableStream<Uint8Array>({ cancel: canceled });
  const controller = new AbortController();
  const pending = readMediaBytes(envFor(body, 1), "private/cache", 10, controller.signal);
  await Promise.resolve();
  controller.abort();
  await expect(pending).rejects.toThrow();
  expect(canceled).toHaveBeenCalledOnce();
});

it("requests an exact R2 range with an ETag condition rather than loading a whole pack", async () => {
  const get = vi.fn(async (_key: string, _options: R2GetOptions) => ({ body: new Blob([new Uint8Array([1, 2, 3])]).stream(), size: 100_000_000,
    httpEtag: '"v1"', range: { offset: 10, length: 3 } }));
  const env = { ENVIRONMENT: "production", VIDEO_BUCKET: { get } } as Bindings;
  expect(await readMediaRange(env, "private/pack", 10, 3, undefined, '"v1"')).toMatchObject({ bytes: new Uint8Array([1, 2, 3]), size: 100_000_000 });
  const options = get.mock.calls[0][1];
  expect(options.range).toEqual({ offset: 10, length: 3 });
  expect((options.onlyIf as Headers).get("if-match")).toBe('"v1"');
});
it.each(["ignored", "changed", "short", "long"])("rejects %s R2 range data", async kind => {
  const body = new Blob([new Uint8Array(kind === "short" ? 2 : kind === "long" ? 4 : 3)]).stream();
  const env = { ENVIRONMENT: "production", VIDEO_BUCKET: { get: async () => ({ body, size: 100,
    httpEtag: kind === "changed" ? '"v2"' : '"v1"', range: kind === "ignored" ? undefined : { offset: 10, length: 3 } }) } } as Bindings;
  await expect(readMediaRange(env, "private/pack", 10, 3, undefined, '"v1"')).rejects.toThrow();
});
it("returns unavailable when a conditional R2 read fails", async () => {
  const env = { ENVIRONMENT: "production", VIDEO_BUCKET: { get: async () => ({ size: 100 }) } } as Bindings;
  expect(await readMediaRange(env, "private/pack", 10, 3, undefined, '"v1"')).toBeNull();
});
it.each([206, 200, 412])("requires HTTP range support and pins the S3 version (status %s)", async status => {
  const env = { USE_S3_STORAGE: "true", R2_ACCESS_KEY_ID: "test", R2_SECRET_ACCESS_KEY: "test",
    R2_S3_ENDPOINT: "https://storage.test", R2_BUCKET_NAME: "bucket" } as Bindings;
  vi.stubGlobal("fetch", async (request: Request) => {
    expect(request.headers.get("range")).toBe("bytes=10-12");
    expect(request.headers.get("if-match")).toBe('"v1"');
    return new Response(new Uint8Array([1, 2, 3]), { status, headers: { "Content-Range": "bytes 10-12/100", ETag: '"v1"' } });
  });
  const read = readMediaRange(env, "private/pack", 10, 3, undefined, '"v1"');
  if (status === 200) await expect(read).rejects.toThrow();
  else if (status === 412) expect(await read).toBeNull();
  else expect(await read).toMatchObject({ size: 100 });
});
