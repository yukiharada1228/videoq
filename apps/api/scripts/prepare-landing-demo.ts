/** Upload the actual LP MP4s through VideoQ and publish their processed demo courses.
 * npm run demo:prepare --workspace @videoq/api -- --origin http://127.0.0.1:8787 --local-user <id>
 * Remote: set VIDEOQ_DEMO_COOKIE_FILE to a file containing the dedicated owner's Cookie header.
 * No transcript, scene, embedding or answer is inserted by this script.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { setTimeout } from 'node:timers/promises';
import type { ProcedureName, RpcInputMap, RpcOutputMap } from '@videoq/trpc';
import { landingDemoMedia } from '../../web/src/lib/landingSamples';

const { values } = parseArgs({ options: {
  origin: { type: 'string', default: 'http://127.0.0.1:8787' },
  'local-user': { type: 'string' },
  check: { type: 'boolean', default: false },
} });
const origin = new URL(values.origin!);
if (origin.pathname !== '/' || origin.username || origin.password || origin.search || origin.hash) {
  throw new Error('--origin must be an origin without a path, query or credentials.');
}
const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
if (!local && origin.protocol !== 'https:') throw new Error('Remote origins require HTTPS.');
if (values['local-user'] && !local) throw new Error('--local-user is only allowed on loopback.');
const cookie = process.env.VIDEOQ_DEMO_COOKIE_FILE
  ? (await readFile(process.env.VIDEOQ_DEMO_COOKIE_FILE, 'utf8')).trim() : '';
if (!values.check && !cookie && !values['local-user']) {
  throw new Error('Provide VIDEOQ_DEMO_COOKIE_FILE or --local-user for an existing local demo owner.');
}
const headers: Record<string, string> = {
  'Content-Type': 'application/json', Origin: origin.origin,
  ...(cookie ? { Cookie: cookie } : {}),
  ...(values['local-user'] ? { 'X-VideoQ-Test-User-Id': values['local-user'] } : {}),
};
async function rpc<K extends ProcedureName>(name: K, input: RpcInputMap[K], mutate = false, anonymous = false): Promise<RpcOutputMap[K]> {
  const url = new URL(`/api/trpc/${name}`, origin);
  if (!mutate) url.searchParams.set('input', JSON.stringify(input));
  const response = await fetch(url, {
    method: mutate ? 'POST' : 'GET',
    headers: anonymous ? { 'Content-Type': 'application/json' } : headers,
    ...(mutate ? { body: JSON.stringify(input) } : {}),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json() as { result?: { data: RpcOutputMap[K] }; error?: { message?: string } };
  if (!response.ok || body.error || !body.result) {
    // Do not log requests, cookies or presigned URLs on failure.
    throw new Error(`${name} failed (${response.status}): ${body.error?.message ?? 'Invalid API response'}`);
  }
  return body.result.data;
}
async function listAll<K extends 'videos.list' | 'courses.list'>(name: K, input: RpcInputMap[K]) {
  const records: { id: number; description: string }[] = [];
  let cursor = 0;
  for (;;) {
    const page = await rpc(name, { ...input, limit: 100, cursor });
    records.push(...page.data);
    cursor += page.data.length;
    if (!page.data.length || cursor >= page.meta.total) break;
  }
  return records;
}
async function waitForVideo(id: number) {
  const deadline = Date.now() + 10 * 60_000;
  let previous = '';
  while (Date.now() < deadline) {
    const video = await rpc('videos.get', { id });
    if (video.status !== previous) console.log(`Video ${id}: ${video.status}`);
    previous = video.status;
    if (video.status === 'completed' && video.transcript?.trim()) return video;
    if (video.status === 'error' || video.status === 'uploading') {
      throw new Error(`Video ${id} is ${video.status}; fix or remove this demo upload before retrying.`);
    }
    await setTimeout(5_000);
  }
  throw new Error(`Video ${id} has not completed in 10 minutes. Check the processing worker and retry.`);
}
for (const locale of ['ja', 'en']) {
  const media = landingDemoMedia(locale);
  const bytes = await readFile(new URL(`../../web/public${media.video}`, import.meta.url));
  const hash = createHash('sha256').update(bytes).digest('hex');
  const marker = `VideoQ LP sample ${locale} v1 sha256:${hash}`;
  const title = locale === 'ja' ? '伝わる説明のつくり方' : 'How to explain clearly';
  if (!values.check) {
    const videos = await listAll('videos.list', { q: title, limit: 100 });
    let video = videos.find(item => item.description === marker);
    if (!video) {
      const upload = await rpc('videos.requestUpload', {
        filename: `explain-${locale}.mp4`, contentType: 'video/mp4', fileSize: bytes.length,
        title, description: marker,
      }, true);
      video = upload.video;
      console.log(`Uploading ${locale} sample as video ${video!.id}`);
      const put = await fetch(upload.upload_url, {
        method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: bytes,
        signal: AbortSignal.timeout(60_000),
      });
      if (!put.ok) throw new Error(`Sample upload failed (${put.status}); video ${video!.id}`);
      await rpc('videos.confirmUpload', { id: video!.id }, true);
    }
    const completed = await waitForVideo(video!.id);
    const courses = await listAll('courses.list', { limit: 100 });
    let course = courses.find(item => item.description === marker);
    if (!course) course = await rpc('courses.create', { name: title, description: marker }, true);
    const detail = await rpc('courses.get', { id: course.id });
    if (detail.videos?.some(item => item.id !== completed.id)) {
      throw new Error(`Demo course ${course.id} contains other videos. It was not modified.`);
    }
    if (!detail.videos?.length) await rpc('memberships.addVideo', { courseId: course.id, videoId: completed.id }, true);
    if (detail.share_slug && detail.share_slug !== media.shareSlug) {
      throw new Error(`Demo course ${course.id} already has another share URL. It was not replaced.`);
    }
    await rpc('courses.createShare', { id: course.id, shareSlug: media.shareSlug }, true);
  }
  const published = await rpc('courses.shared', { slug: media.shareSlug }, false, true);
  if (published.description !== marker || published.videos?.length !== 1 || published.videos[0].status !== 'completed') {
    throw new Error(`${media.shareSlug} is not a completed course for the current MP4.`);
  }
  console.log(`${locale}: ready — course ${published.id}, video ${published.videos[0].id}, /share/${media.shareSlug}`);
}
