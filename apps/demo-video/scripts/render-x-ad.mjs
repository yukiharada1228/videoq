import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = fileURLToPath(new URL('../../../output/x-demo/', import.meta.url));
const review = root + 'review/x-ad/';
const { values } = parseArgs({ options: { stills: { type: 'boolean' }, 'publish-lp': { type: 'boolean' }, hook: { type: 'string', default: 'search' }, locale: { type: 'string', default: 'en' } } });
if (!['search', 'question'].includes(values.hook)) throw new Error('Hook must be search or question.');
if (!['ja', 'en'].includes(values.locale)) throw new Error('Locale must be ja or en.');
if (values['publish-lp'] && (values.locale !== 'en' || values.stills)) throw new Error('--publish-lp requires a full English render.');
if (values.locale === 'en') execFileSync('python3',[root+'scripts/build-x-ad-english-slide.py'],{stdio:'inherit'});
await mkdir(output, { recursive: true });
await mkdir(review, { recursive: true });
const timeline = JSON.parse(await readFile(root + 'content/x-ad-timeline.json', 'utf8'));
const serveUrl = await bundle({ entryPoint: root + 'src/index.tsx', publicDir: root + 'public' });
const browserOptions = { chromeMode: 'headless-shell', browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE, chromiumOptions: { gl: 'angle' } };
const inputProps = { hook: values.hook, locale: values.locale };
const composition = await selectComposition({ serveUrl, id: 'XAd', inputProps, ...browserOptions });
for (const second of timeline.reviewSeconds) {
  await renderStill({ serveUrl, composition, inputProps, ...browserOptions, frame: Math.round(second * timeline.fps), output: review + `${values.hook}-${values.locale}-${second}.png`, imageFormat: 'png' });
}
if (!values.stills) {
  const name = `videoq-x-demo-${values.hook}-${values.locale}-15s`;
  const candidate = review + name + '.mp4';
  let last = -1;
  await renderMedia({ serveUrl, composition, inputProps, ...browserOptions, codec: 'h264', pixelFormat: 'yuv420p', imageFormat: 'png', crf: 19, x264Preset: 'fast', concurrency: 2,
    outputLocation: candidate, onProgress: ({ progress }) => { const value = Math.floor(progress * 10); if (value !== last) { last = value; console.log(`${values.hook}: ${value * 10}%`); } },
  });
  execFileSync('python3', [root + 'scripts/verify-video.py', candidate, '--profile', 'x-ad'], { stdio: 'inherit' });
  await rename(candidate, output + name + '.mp4');
  const labels = ['あの説明、どこだっけ？ 講義動画の復習に、VideoQ。', 'わからないことを、そのまま質問。', '講義をもとに、AIが答える。回答のそばに、参照箇所も。', 'クリックして、元の説明へ。動画を見返して、確かめる。', '講義動画に、質問しよう。VideoQ。無料で試す。videoq.jp'];
  if (values.hook === 'question') labels[0] = 'その講義動画に、質問できたら。講義動画の復習に、VideoQ。';
  if (values.locale === 'en') {
    const copy = JSON.parse(await readFile(root+'content/x-ad-en.json','utf8'));
    labels.splice(0,labels.length,...copy.beats.map(beat=>beat.title.join(' ')+' '+beat.sub),copy.endTitle.join(' ')+' '+copy.cta+'. videoq.jp/en');
    if(values.hook==='question') labels[0]='What if you could ask your lecture? Review your lectures with VideoQ.';
  }
  const stamp = n => `00:00:${n.toFixed(3).padStart(6, '0')}`;
  await writeFile(output + name + '.vtt', 'WEBVTT\n\n' + labels.map((label, i) => `${stamp(timeline.captions[i])} --> ${stamp(timeline.captions[i + 1])}\n${label}\n`).join('\n'));
  if (values['publish-lp']) {
    const lp = fileURLToPath(new URL('../../web/public/demo/', import.meta.url));
    await copyFile(output + name + '.mp4', lp + 'student-demo-en.mp4');
    await copyFile(output + name + '.vtt', lp + 'student-demo-en.vtt');
    execFileSync('python3', ['-c', 'from PIL import Image; import sys; Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2], "WEBP", quality=88)', review + `${values.hook}-en-0.7.png`, lp + 'student-demo-en-poster.webp']);
  }
  console.log('Ready: ' + output + name + '.mp4');
} else console.log('Review frames ready: ' + review);
