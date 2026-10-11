import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFocusFrames } from "../src/lib/focus-frames";
import { inspectVideoClip } from "../src/lib/visual-inspection";
import { readMediaBytes, readMediaRange } from "../src/integrations/media";
import { readVisualManifest } from "../src/lib/visual-manifest";
import { focusCacheFixture } from "./helpers/focus-cache";
import type { Bindings } from "../src/types/bindings";

vi.mock("../src/integrations/media", () => ({ readMediaBytes: vi.fn(), readMediaRange: vi.fn() }));
const env = { OPENAI_API_KEY: "test", VISION_MODEL: "vision-model" } as Bindings;
const video = { id: 42, fileKey: "video.mkv" };
const run = "64972424-b2c6-49b3-b9d3-cb0399ad45fa";
let plan: { version: number; video_id: number; run_id: string; duration_seconds: number; chunk_seconds: number; chunk_count: number; overview: number[][] };
let objects: Map<string, Uint8Array>;
const signal = () => new AbortController().signal;
beforeEach(() => {
  vi.resetAllMocks();
  plan = { version: 2, video_id: 42, run_id: run, duration_seconds: 125.4, chunk_seconds: 60, chunk_count: 3, overview: [] };
  objects = new Map();
  for (let i = 0; i < 3; i++) {
    const times = Array.from({ length: i === 2 ? 6 : 60 }, (_, j) => (i * 60 + j) * 1000);
    const pack = focusCacheFixture(times, index => { index.duration_seconds = 125.4; });
    const dataStart = 12 + new DataView(pack.buffer).getUint32(8, true);
    objects.set(`video.mkv.visual-v2/${run}/${i}.bin`, pack);
    plan.overview.push([times[0], i, dataStart, 6]);
  }
  vi.mocked(readMediaBytes).mockImplementation(async (_env, key) => key.endsWith('.focus-v2.json') ? new TextEncoder().encode(JSON.stringify(plan)) : null);
  vi.mocked(readMediaRange).mockImplementation(async (_env, key, offset, length, _signal, etag) => {
    const bytes = objects.get(key);
    if (!bytes) return null;
    if (etag) expect(etag).toBe('"chunk"');
    return { bytes: bytes.slice(offset, offset + length), etag: '"chunk"', size: bytes.length };
  });
});
afterEach(() => vi.unstubAllGlobals());

it('reads only the two intersecting chunks across a minute boundary', async () => {
  const result = await readFocusFrames(env, video, 55, 71, signal());
  expect(result).toMatchObject({ frames: Array.from({ length: 16 }, (_, i) => ({ timestamp_seconds: i + 55 })) });
  expect(readMediaRange).toHaveBeenCalledTimes(6);
  expect(new Set(vi.mocked(readMediaRange).mock.calls.map(([, key]) => key))).toEqual(new Set([`video.mkv.visual-v2/${run}/0.bin`, `video.mkv.visual-v2/${run}/1.bin`]));
  expect(readMediaBytes).toHaveBeenCalledTimes(1);
});
it('supports fractional final seconds and a duration beyond the requested window', async () => {
  expect(await readFocusFrames(env, video, 120, 130, signal())).toMatchObject({ frames: Array.from({ length: 6 }, (_, i) => ({ timestamp_seconds: 120 + i })) });
});
it('does not substitute a partial interval when a chunk is missing', async () => {
  objects.delete(`video.mkv.visual-v2/${run}/1.bin`);
  expect(await readFocusFrames(env, video, 55, 71, signal())).toHaveProperty('unavailable');
});
it('shares the image budget across both chunks', async () => {
  expect(await readFocusFrames(env, video, 55, 71, signal(), 8)).toHaveProperty('unavailable', expect.stringContaining('budget'));
});
it.each(['identity', 'count', 'path', 'time', 'order'])('rejects malformed %s manifests before image reads', async kind => {
  if (kind === 'identity') plan.video_id = 999;
  if (kind === 'count') plan.chunk_count = 2;
  if (kind === 'path') plan.run_id = '../other';
  if (kind === 'time') plan.overview[0][0] = 60000;
  if (kind === 'order') plan.overview.reverse();
  await expect(readVisualManifest(env, video, signal())).rejects.toThrow();
  expect(readMediaRange).not.toHaveBeenCalled();
});
it('reads only selected JPEG ranges for an overview, never a whole cache or video', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    const request = JSON.parse(String(init.body));
    expect(JSON.stringify(request)).not.toContain('video.mkv');
    expect(JSON.stringify(request).match(/data:image\/jpeg/g)).toHaveLength(3);
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ observations: [{ frame_index: 3, observation: 'Final scene' }] }) } }] });
  }));
  expect(await inspectVideoClip(env, video, 0, Infinity, 'Highlights', signal(), { mode: 'overview', maxFrames: 16 })).toMatchObject({ observations: [{ timestamp: 120, text: 'Final scene' }] });
  expect(readMediaBytes).toHaveBeenCalledTimes(1);
  expect(readMediaRange).toHaveBeenCalledTimes(3);
  expect(vi.mocked(readMediaRange).mock.calls.every(call => call[3] === 6)).toBe(true);
});
