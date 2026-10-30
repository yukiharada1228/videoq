import { AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { ProductScreen, answer, citation, path, ramp, type Point } from './StudentDemo';
import course from '../content/course.json';
import recording from '../content/answer.json';
import englishAd from '../content/x-ad-en.json';
import copy from '../content/provider-copy.json';
import timeline from '../content/provider-timeline.json';
import studentTiming from '../content/provider-student-timeline.json';

type Locale = 'ja' | 'en';
const fade = (f:number, start:number, end:number) =>
  interpolate(f, [start, start + .25, end - .3, end], [0, 1, 1, 0], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});

export function ProviderHeader({locale}:{locale:Locale}) {
  return <div className="film-top"><span className="wordmark">VideoQ<span> / FOR INSTRUCTORS</span></span><span className="film-tag">{copy[locale].tag}</span></div>;
}

function Caption({locale, index}:{locale:Locale; index:number}) {
  return <div className="film-caption"><span>{String(index + 1).padStart(2, '0')}</span>{copy[locale].captions[index]}</div>;
}

function OwnerBar({locale}:{locale:Locale}) {
  return <div className="owner-bar"><b>VideoQ</b><span>{locale==='ja'?'ライブラリ　 /　 講座':'Library　 /　 Courses'}</span><em>{locale==='ja'?'講師の画面':'Instructor’s view'}</em></div>;
}

// The incoming messages illustrate the problem and are labelled as such; they
// are not product data.
function Hook({locale}:{locale:Locale}) {
  const f = useCurrentFrame() / timeline.fps;
  const text = copy[locale].hook;
  const headline = interpolate(f, [1.3, 1.6], [0, 1], {extrapolateLeft:'clamp', extrapolateRight:'clamp'});
  return <AbsoluteFill className="film">
    <ProviderHeader locale={locale}/>
    <div className="screen-window owner-screen" style={{opacity:fade(f, 0, timeline.setup)}}>
      <OwnerBar locale={locale}/>
      <div className="owner-content">
        <aside className="owner-context" style={{opacity:headline, transform:`translateY(${(1 - headline) * 12}px)`}}>
          <h2>{text.title.map((line, i) => <span key={line}>{i > 0 && <br/>}{line}</span>)}</h2>
        </aside>
        <section className="owner-card">
          <div className="owner-card-title">{text.inbox}<small className="owner-illustration">{text.illustration}</small></div>
          {text.messages.map((message, i) => {
            const enter = ramp(f, .15 + i * .45, .45 + i * .45);
            return <div key={message} className="owner-message" style={{opacity:enter, transform:`translateY(${(1 - enter) * 18}px)`}}>{message}</div>;
          })}
        </section>
      </div>
    </div>
    <Caption locale={locale} index={0}/>
  </AbsoluteFill>;
}

// Reconstructed setup screens reflect upload, course creation and link sharing.
// No invitation is sent and no production course is made public to render this film.
function OwnerSetup({locale}:{locale:Locale}) {
  const f = useCurrentFrame() / timeline.fps;
  const ja = locale === 'ja';
  const sharing = f >= 4;
  const ready = f >= 1.8;
  const added = f >= 2.6;
  const copied = f >= 5.8;
  return <AbsoluteFill className="film">
    <ProviderHeader locale={locale}/>
    <div className="screen-window owner-screen" style={{opacity:fade(f, 0, timeline.student - timeline.setup)}}>
      <OwnerBar locale={locale}/>
      <div className="owner-content">
        <aside className="owner-context">
          <span className="owner-step">{sharing ? '02 / SHARE' : '01 / PREPARE'}</span>
          <h2>{ja ? (sharing ? <>講座を、<br/>受講生へ。</> : <>講義動画を、<br/>講座に。</>) : (sharing ? <>Share it<br/>with students.</> : <>Your lectures.<br/>One course.</>)}</h2>
          <p>{ja ? (sharing ? '共有リンク、またはメンバー招待で。' : '講義・教材・研修動画を登録します。') : (sharing ? 'Use a sharing link or invite members.' : 'Start with your lecture or training videos.')}</p>
        </aside>
        {!sharing ? <section className="owner-card">
          <div className="owner-card-title">{ready ? (ja ? '講座に動画を追加' : 'Add to a course') : (ja ? '動画をアップロード' : 'Upload a video')}</div>
          <div className="owner-video-row"><Img src={staticFile('lessons/math-poster.webp')}/><div><b>{ja ? course.lessons[1].title : englishAd.titles[1]}</b><small>MP4 · 1:00</small></div><span className="owner-status">{ready ? (ja ? '✓ 完了' : '✓ Ready') : (ja ? '文字起こし中' : 'Transcribing')}</span></div>
          <div className="owner-progress"><i style={{width:`${interpolate(f, [.2, 1.8], [12, 100], {extrapolateLeft:'clamp', extrapolateRight:'clamp'})}%`}}/></div>
          <label>{ja ? '講座名' : 'Course name'}</label><div className="owner-field">{ja ? course.name : englishAd.courseName}</div>
          <div className="owner-button">{added ? (ja ? '✓ 動画を追加しました' : '✓ Video added') : (ja ? '講座に追加' : 'Add to course')}</div>
          <small className="owner-wait">{ja ? '処理・待ち時間を短縮した再現です' : 'Processing and waiting times are shortened.'}</small>
        </section> : <section className="owner-card">
          <div className="owner-card-title">{ja ? '講座を共有' : 'Share course'}</div>
          <div className="owner-notice">{ja ? 'リンクを知っている人は、ログインなしで閲覧・チャットできます。' : 'Anyone with the link can view and chat without signing in.'}</div>
          <label>{ja ? '共有リンク' : 'Sharing link'}</label><div className="owner-field owner-link">videoq.jp/share/…</div>
          <div className="owner-button">{copied ? (ja ? '✓ コピーしました' : '✓ Copied') : (ja ? 'リンクをコピー' : 'Copy link')}</div>
          <small className="owner-wait">{ja ? 'AI回答は講座の所有者の利用枠を使います' : 'AI answers use the course owner’s allowance.'}</small>
        </section>}
      </div>
    </div>
    <Caption locale={locale} index={sharing ? 2 : 1}/>
  </AbsoluteFill>;
}

// Local seconds within the student segment; each move settles before the click.
const camera:Point[] = [
  {f:0,x:720,y:382,z:1},{f:.55,x:720,y:382,z:1},
  {f:.9,x:305,y:270,z:1.35},{f:1.3,x:305,y:270,z:1.35},
  {f:1.8,x:1160,y:550,z:1.75},{f:4.1,x:1160,y:550,z:1.75},
  {f:4.6,x:1200,y:370,z:1.95},{f:8.8,x:1200,y:370,z:1.95},
  {f:9.1,x:1200,y:430,z:1.85},{f:9.55,x:1200,y:430,z:1.85},
  {f:10,x:665,y:444,z:1.4},{f:13,x:665,y:444,z:1.4},
];
const cursor:Point[] = [
  {f:0,x:655,y:670},{f:.55,x:655,y:670},{f:.95,x:160,y:249},
  {f:1.35,x:160,y:249},{f:1.85,x:1212,y:678},{f:3.65,x:1212,y:678},
  {f:3.9,x:1375,y:678},{f:4.05,x:1375,y:678},{f:4.35,x:1350,y:580},
  {f:8.9,x:1350,y:580},{f:9.25,x:1207,y:422},{f:9.6,x:1207,y:422},
  {f:9.95,x:814,y:595},{f:13,x:814,y:595},
];
const studentBeats = timeline.captions.slice(3, 7).map(at => at - timeline.student);

function StudentView({locale}:{locale:Locale}) {
  const f = useCurrentFrame() / timeline.fps;
  const c = path(f, camera), p = path(f, cursor);
  const fit = 1680 / 1440;
  const tx = Math.max(1680 * (1 - c.z), Math.min(0, 840 - c.x * fit * c.z));
  const ty = Math.max(842 * (1 - c.z), Math.min(0, 421 - c.y * fit * c.z));
  const t = studentTiming;
  const step = studentBeats.filter(at => f >= at).length - 1;
  const click = [t.select, t.focus, t.send, t.sourceClick].map(at => f - at).find(age => age >= 0 && age < .28);
  return <AbsoluteFill className="film">
    <ProviderHeader locale={locale}/>
    <div className="screen-window" style={{opacity:fade(f, 0, timeline.history - timeline.student), transform:`translateX(${ramp(f, 0, .35, 40, 0)}px)`}}>
      <div className="screen-camera" style={{transform:`translate(${tx}px,${ty}px) scale(${c.z * fit})`}}><ProductScreen frame={f} timing={t} locale={locale}/></div>
      <div className="cursor" style={{left:p.x * fit * c.z + tx, top:p.y * fit * c.z + ty, opacity:f > t.typingStart && f < t.typingEnd ? .15 : 1}}>
        {click !== undefined && <div className="click-ring" style={{transform:`translate(-50%,-50%) scale(${.45 + click / .24})`, opacity:1 - click / .28}}/>}
        <svg width="36" height="44" viewBox="0 0 30 40"><path d="M3 2v29l7-8 7 15 6-3-7-14h11z" fill="#172f3c" stroke="white" strokeWidth="2.4" strokeLinejoin="round"/></svg>
      </div>
    </div>
    <Caption locale={locale} index={3 + step}/>
  </AbsoluteFill>;
}

// The history entry is the same real question and answer shown above, as the
// owner's conversation history displays a shared-link visitor's question.
function OwnerHistory({locale}:{locale:Locale}) {
  const f = useCurrentFrame() / timeline.fps;
  const text = copy[locale].history;
  const english = locale === 'en';
  const question = english ? englishAd.question : recording.question;
  const response = english ? englishAd.answer : answer;
  const excerpt = response.length > 72 ? `${response.slice(0, 72)}…` : response;
  const highlight = ramp(f, .9, 1.3);
  const captured = new Date(recording.capturedAt).toLocaleString(english ? 'en-US' : 'ja-JP', {timeZone:'Asia/Tokyo', dateStyle:'medium', timeStyle:'short'});
  return <AbsoluteFill className="film">
    <ProviderHeader locale={locale}/>
    <div className="screen-window owner-screen" style={{opacity:fade(f, 0, timeline.outro - timeline.history)}}>
      <OwnerBar locale={locale}/>
      <div className="owner-content">
        <aside className="owner-context">
          <span className="owner-step">{text.step}</span>
          <h2>{text.title[0]}<br/>{text.title[1]}</h2>
          <p>{text.body}</p>
        </aside>
        <section className="owner-card">
          <div className="owner-card-title owner-history-title">{text.card}<span className="owner-csv">↓ CSV</span></div>
          <div className="owner-history-date">{captured}</div>
          <div className="owner-history-question" style={{boxShadow:`0 0 0 ${highlight * 4}px rgba(49,78,194,${highlight * .35})`}}>
            <small>{text.visitor}</small>{question}
          </div>
          <div className="owner-history-answer"><b>{text.teacher}</b>{excerpt} <span>{citation}</span></div>
        </section>
      </div>
    </div>
    <Caption locale={locale} index={7}/>
  </AbsoluteFill>;
}

function Outro({locale}:{locale:Locale}) {
  const f = useCurrentFrame() / timeline.fps;
  const text = copy[locale].outro;
  return <AbsoluteFill className="film">
    <AbsoluteFill className="outro" style={{opacity:ramp(f, 0, timeline.outroEnd - timeline.outro)}}>
      <div className="outro-mark">Q</div><p>{text.sub}</p>
      <h1>{text.title[0]}<br/>{text.title[1]}</h1>
      <div className="outro-cta">{text.cta} <span>→</span></div><small>{locale==='en'?'videoq.jp/en':'videoq.jp'}</small>
      <em className="outro-disclosure">{text.disclosure}</em>
    </AbsoluteFill>
  </AbsoluteFill>;
}

const seconds = (value:number) => Math.round(value * timeline.fps);

export function ProviderDemo({locale='ja'}:{locale?:Locale}) {
  return <AbsoluteFill>
    <Audio src={staticFile('audio/ambient.mp3')} volume={frame=>.30*interpolate(frame/timeline.fps,[0,.4,timeline.duration-1.5,timeline.duration],[0,1,1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}/>
    <Sequence durationInFrames={seconds(timeline.setup)}><Hook locale={locale}/></Sequence>
    <Sequence from={seconds(timeline.setup)} durationInFrames={seconds(timeline.student - timeline.setup)}><OwnerSetup locale={locale}/></Sequence>
    <Sequence from={seconds(timeline.student)} durationInFrames={seconds(timeline.history - timeline.student)}><StudentView locale={locale}/></Sequence>
    <Sequence from={seconds(timeline.history)} durationInFrames={seconds(timeline.outro - timeline.history)}><OwnerHistory locale={locale}/></Sequence>
    <Sequence from={seconds(timeline.outro)}><Outro locale={locale}/></Sequence>
  </AbsoluteFill>;
}
