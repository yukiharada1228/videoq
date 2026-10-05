import { AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { ProviderHeader, StudentDemo } from './StudentDemo';
import course from '../content/course.json';
import copy from '../content/provider-copy.json';
import timeline from '../content/provider-timeline.json';

// Reconstructed setup screens reflect upload, course creation and link sharing.
// No invitation is sent and no production course is made public to render this film.
function OwnerSetup({locale}:{locale:'ja'|'en'}) {
  const f=useCurrentFrame()/timeline.fps;
  const sharing=f>=4;
  const ready=f>=2;
  const copied=f>=6.5;
  const opacity=interpolate(f,[0,.25,7.7,8],[0,1,1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  return <AbsoluteFill className="film">
    <ProviderHeader locale={locale}/>
    <div className="screen-window owner-screen" style={{opacity}}>
      <div className="owner-bar"><b>VideoQ</b><span>ライブラリ　 /　 講座</span><em>{locale==='ja'?'担当者の画面':'Course owner’s view'}</em></div>
      <div className="owner-content">
        <aside className="owner-context">
          <span className="owner-step">{sharing?'02 / SHARE':'01 / PREPARE'}</span>
          <h2>{locale==='ja'?(sharing?<>講座を、<br/>受講者へ。</>:<>手元の動画を、<br/>講座に。</>):(sharing?<>Share it<br/>with learners.</>:<>Your videos.<br/>One course.</>)}</h2>
          <p>{locale==='ja'?(sharing?'共有リンク、またはメンバー招待で。':'講義・教材・研修動画を登録します。'):(sharing?'Use a sharing link or invite members.':'Start with your teaching or training videos.')}</p>
        </aside>
        {!sharing?<section className="owner-card">
          <div className="owner-card-title">{ready?'講座に動画を追加':'動画をアップロード'}</div>
          <div className="owner-video-row"><Img src={staticFile('lessons/math-poster.webp')}/><div><b>{course.lessons[1].title}</b><small>MP4 · 1:00</small></div><span className="owner-status">{ready?'✓ 完了':'文字起こし中'}</span></div>
          <div className="owner-progress"><i style={{width:`${interpolate(f,[.3,2],[12,100],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}%`}}/></div>
          <label>講座名</label><div className="owner-field">{course.name}</div>
          <div className="owner-button">{f>=3?'✓ 動画を追加しました':'講座に追加'}</div>
          <small className="owner-wait">{locale==='ja'?'処理・待ち時間を短縮した再現です':'Processing and waiting times are shortened.'}</small>
        </section>:<section className="owner-card">
          <div className="owner-card-title">講座を共有</div>
          <div className="owner-notice">リンクを知っている人は、ログインなしで閲覧・チャットできます。</div>
          <label>共有リンク</label><div className="owner-field owner-link">videoq.jp/share/…</div>
          <div className="owner-button">{copied?'✓ コピーしました':'リンクをコピー'}</div>
          <small className="owner-wait">{locale==='ja'?'AI回答は担当者の利用枠を使います':'AI answers use the course owner’s allowance.'}</small>
        </section>}
      </div>
    </div>
    <div className="film-caption"><span>{sharing?'02':'01'}</span>{copy[locale].captions[sharing?1:0]}</div>
  </AbsoluteFill>;
}

export function ProviderDemo({locale='ja'}:{locale?:'ja'|'en'}) {
  return <AbsoluteFill>
    <Sequence durationInFrames={timeline.intro*timeline.fps}>
      <OwnerSetup locale={locale}/>
      <Audio src={staticFile('audio/ambient.mp3')} volume={frame=>.30*interpolate(frame/timeline.fps,[0,.4,7.6,8],[0,1,1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}/>
    </Sequence>
    <Sequence from={timeline.intro*timeline.fps}><StudentDemo locale={locale} provider/></Sequence>
  </AbsoluteFill>;
}
