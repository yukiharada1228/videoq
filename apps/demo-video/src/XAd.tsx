import { AbsoluteFill, Audio, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { ProductScreen } from './StudentDemo';
import timeline from '../content/x-ad-timeline.json';
import english from '../content/x-ad-en.json';
import './x-ad.css';

type Key = { t: number; x: number; y: number; scale: number };
const smooth = (p: number) => p * p * p * (p * (p * 6 - 15) + 10);
const mix = (t: number, a: number, b: number, from = 0, to = 1) =>
  from + (to - from) * smooth(Math.max(0, Math.min(1, (t - a) / (b - a))));
const track = (t: number, keys: Key[]) => {
  const next = keys.findIndex(key => key.t > t);
  if (next === 0) return keys[0];
  if (next < 0) return keys[keys.length - 1];
  const a = keys[next - 1], b = keys[next];
  return { t, x: mix(t, a.t, b.t, a.x, b.x), y: mix(t, a.t, b.t, a.y, b.y), scale: mix(t, a.t, b.t, a.scale, b.scale) };
};

// Camera coordinates refer to the original 1440 × 722 product surface.
// Each move settles before the click or text that viewers need to read.
const cameras: Key[] = [
  { t: 0, x: 720, y: 361, scale: .67 },
  { t: 1.05, x: 720, y: 361, scale: .69 },
  { t: 1.65, x: 1160, y: 566, scale: 1.95 },
  { t: 3.8, x: 1160, y: 566, scale: 1.95 },
  { t: 4.3, x: 1200, y: 398, scale: 2.12 },
  { t: 8.8, x: 1200, y: 398, scale: 2.12 },
  { t: 9.4, x: 658, y: 459, scale: 1.2 },
  { t: 12, x: 658, y: 459, scale: 1.2 },
];
const cursors: Key[] = [
  { t: 0, x: 770, y: 510, scale: 1 },
  { t: 1, x: 770, y: 510, scale: 1 },
  { t: 1.6, x: 1160, y: 678, scale: 1 },
  { t: 3.12, x: 1160, y: 678, scale: 1 },
  { t: 3.32, x: 1375, y: 678, scale: 1 },
  { t: 3.55, x: 1375, y: 678, scale: 1 },
  { t: 4, x: 1365, y: 520, scale: 1 },
  { t: 7.9, x: 1365, y: 520, scale: 1 },
  { t: 8.52, x: 1207, y: 422, scale: 1 },
  { t: 8.82, x: 1207, y: 422, scale: 1 },
  { t: 9.45, x: 889, y: 576, scale: 1 },
  { t: 12, x: 889, y: 576, scale: 1 },
];

const beats = [
  { at: 0, title: ['あの説明、', 'どこだっけ？'], sub: '講義動画の復習に、VideoQ。', step: -1 },
  { at: 1.6, title: ['わからないことを、', 'そのまま質問。'], sub: '「微分って、結局何を表すの？」', step: 0 },
  { at: 4.3, title: ['講義をもとに、', 'AIが答える。'], sub: '回答のそばに、参照箇所も。', step: 1 },
  { at: 8.6, title: ['クリックして、', '元の説明へ。'], sub: '動画を見返して、確かめる。', step: 2 },
];

export function XAd({ hook = 'search', locale = 'ja' }: { hook?: 'search' | 'question'; locale?: 'ja' | 'en' }) {
  const frame = useCurrentFrame();
  const t = frame / timeline.fps;
  const camera = track(t, cameras), cursor = track(t, cursors);
  const tx = 492 - camera.x * camera.scale;
  const ty = 274 - camera.y * camera.scale;
  const localizedBeats = beats.map((beat,i)=>locale==='en'?{...beat,...english.beats[i]}:beat);
  const beat = [...localizedBeats].reverse().find(b => t >= b.at)!;
  const introAlternative = hook === 'question' && t < beats[1].at;
  const heading = introAlternative ? (locale==='en'?['What if you could', 'ask your lecture?']:['その講義動画に、', '質問できたら。']) : beat.title;
  const textEnter = mix(t, beat.at, beat.at + .24);
  const outro = mix(t, timeline.outro, timeline.outroEnd);
  const clickAge = [timeline.focus, timeline.send, timeline.sourceClick]
    .map(at => t - at).find(age => age >= 0 && age < .36);
  const cursorVisible = t > 1.85 && t < 3.08 ? .15 : t > 4.35 && t < 7.85 ? 0 : 1;

  return <AbsoluteFill className="x-ad">
    <Audio src={staticFile('audio/ambient.mp3')} volume={f => .22 * interpolate(f / timeline.fps, [0, .3, 13.8, 15], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
    <div className="xad-orbit" />
    <div className="xad-brand"><Img src={staticFile('brand/videoq.png')} /><strong>VideoQ</strong><span>{locale==='en'?english.brand:'講義動画に、質問しよう。'}</span></div>
    <div className="xad-main" style={{ opacity: 1 - outro }}>
      <div className="xad-copy" style={{ transform: `translateY(${(1 - textEnter) * 12}px)`, opacity: .75 + .25 * textEnter }}>
        <h1>{heading[0]}<br /><span>{heading[1]}</span></h1>
        <p>{beat.sub}</p>
      </div>
      <div className="xad-window">
        <div className="xad-browser"><span /><span /><span /><div>videoq.jp</div><b>{locale==='en'?english.browserLabel:'講義動画 × AI'}</b></div>
        <div className="xad-viewport">
          <div className="xad-camera" style={{ transform: `translate(${tx}px, ${ty}px) scale(${camera.scale})` }}>
            <ProductScreen frame={t} timing={timeline} locale={locale} />
          </div>
          <div className="xad-cursor" style={{ left: tx + cursor.x * camera.scale, top: ty + cursor.y * camera.scale, opacity: cursorVisible }}>
            {clickAge !== undefined && <div className="xad-click" style={{ opacity: 1 - clickAge / .36, transform: `translate(-50%, -50%) scale(${.4 + clickAge * 3})` }} />}
            <svg width="32" height="40" viewBox="0 0 30 40"><path d="M3 2v29l7-8 7 15 6-3-7-14h11z" fill="#131b45" stroke="white" strokeWidth="2.4" strokeLinejoin="round" /></svg>
          </div>
        </div>
      </div>
      <div className="xad-steps">{(locale==='en'?english.steps:['質問する', '回答を読む', '動画で確認']).map((label, i) => <div key={label} className={beat.step === i ? 'active' : ''}><b>{String(i + 1).padStart(2, '0')}</b><span>{label}</span>{i < 2 && <em>→</em>}</div>)}</div>
    </div>
    {t >= timeline.outro && <div className="xad-outro" style={{ opacity: outro, transform: `translateY(${(1 - outro) * 16}px)` }}>
      <div className="xad-end-icon"><Img src={staticFile('brand/videoq.png')} /></div>
      <p>{locale==='en'?english.endSub:'あなたの講義動画が、復習パートナーに。'}</p>
      <h2>{locale==='en'?english.endTitle[0]:'講義動画に、'}<br /><span>{locale==='en'?english.endTitle[1]:'質問しよう。'}</span></h2>
      <div className="xad-cta">{locale==='en'?english.cta:'無料で試す'} <span>↗</span></div>
      <strong className="xad-url">{locale==='en'?'videoq.jp/en':'videoq.jp'}</strong>
    </div>}
    <div className="xad-disclosure">{locale==='en'?english.disclosure:'実データに基づく操作再現・待ち時間を短縮'}</div>
  </AbsoluteFill>;
}
