// Prepares what the real product screens need and Remotion cannot bundle:
// the web app's compiled stylesheet, and lessons the page's <video> can decode
// (Chrome Headless Shell has no H.264). Output is generated and not committed.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const web = fileURLToPath(new URL('../../web/', import.meta.url));
const require = createRequire(web + 'package.json');
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const output = root + 'public/generated/';
await mkdir(output + 'lessons', { recursive: true });

const from = web + 'src/index.css';
const { css } = await postcss([tailwind({ base: web })]).process(await readFile(from, 'utf8'), { from });
await writeFile(output + 'web.css', css);
await copyFile(web + 'public/logo192.png', output + 'logo192.png');

const encode = (input, name, rate = '30', crf = '36') => {
  const target = `${output}lessons/${name}.webm`;
  if (existsSync(target)) return;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...input, '-an', '-r', rate, '-g', rate, '-c:v', 'libvpx-vp9', '-crf', crf, '-b:v', '0', '-cpu-used', '5', target], { stdio: 'inherit' });
};
const course = JSON.parse(await readFile(root + 'content/course.json', 'utf8'));
for (const { key } of course.lessons) encode(['-i', `${root}public/lessons/${key}.mp4`], key);
// English films show the translated first slide of the two lessons they open.
for (const [key, name] of [['math', 'math-en'], ['writing', 'writing-en']]) {
  encode(['-loop', '1', '-t', '60', '-i', `${root}public/brand/${key}-en-poster.webp`], name, '5', '50');
}
