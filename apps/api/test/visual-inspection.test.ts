import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { inspectVideoClip, selectClipFrames } from "../src/lib/visual-inspection";
import { readMediaBytes } from "../src/integrations/media";
import type { Bindings } from "../src/types/bindings";

vi.mock("../src/integrations/media", () => ({ readMediaBytes: vi.fn() }));
const env = { OPENAI_API_KEY: "test", OPENAI_BASE_URL: "https://vision.test/v1", VISION_MODEL: "vision-model" } as Bindings;
const frames = Array.from({ length: 20 }, (_, i) => ({ timestamp_seconds: i * 5, jpeg_base64: Buffer.from([0xff, 0xd8, 0xff, i, 0xff, 0xd9]).toString("base64") }));
const cache = { version: 1, video_id: 42, duration_seconds: 100, sampling_interval_seconds: 5, frames };
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const inspect = (signal = new AbortController().signal) => inspectVideoClip(env, { id: 42, fileKey: "private/video.mp4" }, 10, 70, "Read the equation", signal);
beforeEach(() => vi.mocked(readMediaBytes).mockReset().mockResolvedValue(encode(cache)));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("selects at most eight in-window frames across the interval", () => {
  const selected = selectClipFrames(frames, 10, 70);
  expect(selected).toHaveLength(8);
  expect(selected[0].timestamp_seconds).toBe(10);
  expect(selected.at(-1)!.timestamp_seconds).toBe(65);
  expect(selectClipFrames(frames, 15, 20).map(f => f.timestamp_seconds)).toEqual([15]);
  expect(new Set(selected.map(f => f.timestamp_seconds)).size).toBe(8);
  expect(selectClipFrames(frames, 11, 14)).toEqual([]);
});
it("sends only selected images, resolves citations by server frame index, and reports usage", async () => {
  const requests: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ observations: requests.length === 1 ? [{ frame_index: 1, observation: "x = 2" }] : [] }) } }], usage: { prompt_tokens: 20, completion_tokens: 5 } });
  }));
  const result = await inspect();
  expect(result).toMatchObject({ observations: [{ timestamp: 10, text: "x = 2" }] });
  expect(JSON.stringify(requests[0])).not.toContain("private/video.mp4");
  expect(JSON.stringify(requests[0]).match(/data:image\/jpeg/g)).toHaveLength(1);
  expect(requests).toHaveLength(8);
  expect(requests[0].model).toBe("vision-model");
  expect(requests[0].stream).toBeUndefined();
});
it("reuses exact duplicate still observations while preserving every actual citation time", async () => {
  vi.mocked(readMediaBytes).mockResolvedValue(encode({ ...cache, frames: [
    { ...frames[0], timestamp_seconds: 10 }, { ...frames[0], timestamp_seconds: 15 },
    { ...frames[1], timestamp_seconds: 20 },
  ] }));
  const fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
    const request = JSON.parse(String(init.body));
    const index = Number(JSON.stringify(request).match(/frame_index=(\d+)/)![1]);
    expect(JSON.stringify(request.messages)).not.toContain("timestamp_seconds");
    expect(request.response_format.json_schema.schema.properties.observations.items.properties.frame_index.enum).toEqual([index]);
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
      observations: [{ frame_index: index, observation: index === 1 ? "Cyan triangle" : "Purple star" }],
    }) } }] });
  });
  vi.stubGlobal("fetch", fetch);
  expect(await inspect()).toMatchObject({ observations: [
    { timestamp: 10, text: "Cyan triangle" }, { timestamp: 15, text: "Cyan triangle" }, { timestamp: 20, text: "Purple star" },
  ], sampled_timestamps: [10, 15, 20] });
  expect(fetch).toHaveBeenCalledTimes(2);
});
it("compares temporal images together and merges attributes at their actual frame times", async () => {
  vi.mocked(readMediaBytes).mockResolvedValue(encode({ ...cache, frames: frames.slice(2, 4) }));
  const fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
    const request = JSON.parse(String(init.body));
    expect(JSON.stringify(request).match(/data:image\/jpeg/g)).toHaveLength(2);
    expect(request.response_format.json_schema.schema.properties.observations.items.properties.frame_index.enum).toEqual([1, 2]);
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
      observations: [{ frame_index: 2, observation: "Right" },
        { frame_index: 1, observation: "Left" }, { frame_index: 2, observation: "Purple circle" }],
    }) } }] });
  });
  vi.stubGlobal("fetch", fetch);
  const result = await inspectVideoClip(env, { id: 42, fileKey: "private/video.mp4" }, 10, 20,
    "どちらへ移動しますか", new AbortController().signal);
  expect(result).toMatchObject({ observations: [
    { timestamp: 10, text: "Left" }, { timestamp: 15, text: "Right\nPurple circle" },
  ] });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each(["overview", "skim", "inspect"] as const)("uses bounded frames and image detail appropriate to %s", async mode => {
  let request: { messages: { content: unknown }[] } | undefined;
  vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
    request = JSON.parse(String(init.body));
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
      observations: mode === "inspect" && !JSON.stringify(request).includes("frame_index=8") ? [] : [{ frame_index: mode === "overview" ? 16 : 8, observation: "Late diagram" }],
    }) } }] });
  });
  const result = await inspectVideoClip(env, { id: 42, fileKey: "private/video.mp4" }, 0, Infinity, "Locate diagram", new AbortController().signal, { mode, maxFrames: 16 });
  const parts = request!.messages[1].content as { type: string; image_url?: { detail: string } }[];
  const images = parts.filter(part => part.type === "image_url");
  expect(images).toHaveLength(mode === "overview" ? 16 : mode === "inspect" ? 1 : 8);
  expect(images.every(part => part.image_url?.detail === (mode === "inspect" ? "high" : "low"))).toBe(true);
  expect(result).toMatchObject({ observations: [{ timestamp: 95, text: "Late diagram" }], duration_seconds: 100 });
});
it.each(["missing", "mismatched", "empty-window", "malformed"])("handles %s cache without calling the model", async kind => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  if (kind === "missing") vi.mocked(readMediaBytes).mockResolvedValue(null);
  if (kind === "mismatched") vi.mocked(readMediaBytes).mockResolvedValue(encode({ ...cache, video_id: 99 }));
  if (kind === "empty-window") vi.mocked(readMediaBytes).mockResolvedValue(encode({ ...cache, frames: [frames[0]] }));
  if (kind === "malformed") vi.mocked(readMediaBytes).mockResolvedValue(encode({ ...cache, frames: [{ timestamp_seconds: 10, jpeg_base64: "https://untrusted/image" }] }));
  if (kind === "missing" || kind === "empty-window") expect(await inspect()).toHaveProperty("unavailable");
  else await expect(inspect()).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
it.each(["index", "length", "refusal"])("rejects invalid vision output: %s", async kind => {
  vi.stubGlobal("fetch", async () => Response.json({ choices: [{
    finish_reason: kind === "length" ? "length" : "stop",
    message: { refusal: kind === "refusal" ? "refused" : null, content: JSON.stringify({ observations:
      [{ frame_index: kind === "index" ? 9 : 1, observation: "a" }],
    }) },
  }] }));
  await expect(inspect()).rejects.toThrow();
});
it("cancels an in-flight model request", async () => {
  const controller = new AbortController();
  const started = Promise.withResolvers<void>();
  vi.stubGlobal("fetch", (_url: unknown, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal!.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
    started.resolve();
  }));
  const pending = inspect(controller.signal);
  await started.promise;
  controller.abort();
  await expect(pending).rejects.toThrow();
});
