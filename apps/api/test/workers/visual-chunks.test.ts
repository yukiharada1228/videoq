import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import { readFocusFrames } from '../../src/lib/focus-frames';
import { deleteVisualChunks } from '../../src/integrations/media';
import { focusCacheFixture } from '../helpers/focus-cache';
import type { Bindings } from '../../src/types/bindings';

it('reads split focus frames and deletes all generations without touching another video', async () => {
  const fileKey = `test/visual-${crypto.randomUUID()}`;
  const run = crypto.randomUUID();
  const prefix = `media/${fileKey}.visual-v2/`;
  const manifestKey = `media/${fileKey}.focus-v2.json`;
  const other = `${prefix.slice(0, -1)}-other/keep.bin`;
  const bindings = { ...env, ENVIRONMENT: 'production' } as Bindings;
  try {
    await env.VIDEO_BUCKET.put(other, 'keep');
    const overview: number[][] = [];
    for (let i = 0; i < 2; i++) {
      const pack = focusCacheFixture(Array.from({ length: 60 }, (_, j) => (i * 60 + j) * 1000), index => { index.duration_seconds = 120; });
      overview.push([i * 60000, i, 12 + new DataView(pack.buffer).getUint32(8, true), 6]);
      await env.VIDEO_BUCKET.put(`${prefix}${run}/${i}.bin`, pack);
    }
    await env.VIDEO_BUCKET.put(manifestKey, JSON.stringify({ version: 2, video_id: 42, run_id: run,
      duration_seconds: 120, chunk_seconds: 60, chunk_count: 2, overview }));
    const result = await readFocusFrames(bindings, { id: 42, fileKey }, 55, 71, new AbortController().signal);
    expect(result).toMatchObject({ frames: Array.from({ length: 16 }, (_, i) => ({ timestamp_seconds: i + 55 })) });
    // A deleted video must also remove unpublished data from prior attempts,
    // even when there are more objects than a single cleanup page.
    for (let i = 0; i < 102; i++) await env.VIDEO_BUCKET.put(`${prefix}old/${i}.json`, '{}');
    await deleteVisualChunks(bindings, fileKey);
    expect((await env.VIDEO_BUCKET.list({ prefix })).objects).toHaveLength(0);
    expect(await env.VIDEO_BUCKET.head(other)).not.toBeNull();
    await deleteVisualChunks(bindings, fileKey);
  } finally {
    await deleteVisualChunks(bindings, fileKey);
    await env.VIDEO_BUCKET.delete([manifestKey, other]);
  }
});
