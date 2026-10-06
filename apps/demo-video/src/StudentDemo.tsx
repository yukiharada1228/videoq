import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import course from '../content/course.json';
import recording from '../content/answer.json';
import timeline from '../content/timeline.json';
import providerCopy from '../content/provider-copy.json';
import englishAd from '../content/x-ad-en.json';
import './style.css';

// These are the actual course and unedited answer/citation produced by VideoQ.
// Only the UI interaction and camera timing are reconstructed for the film.
const answer = recording.events.filter(event => event.type === 'text_delta').map(event => event.text ?? '').join('');
const citedId = recording.events.find(event => event.type === 'citation')?.sourceId;
const source = recording.events.find(event => event.type === 'source' && event.source?.id === citedId)?.source;
if (!source) throw new Error('A real citation is required to render the demo.');
const mathVideo = recording.course.videos.find(video => video.title === course.lessons[1].title);
if (source.video_id !== mathVideo?.id) throw new Error('The cited video must match the mathematics lesson shown in this edit.');
const seconds = (value: string) => value.replace(',', '.').split(':').reduce((total, part) => total * 60 + Number(part), 0);
const sourceStart = seconds(source.start_time);
const clock = (value:number) => `${Math.floor(value/60)}:${Math.floor(value%60).toString().padStart(2,'0')}`;
const citation = `(${clock(sourceStart)}–${clock(seconds(source.end_time))})`;
const ease = (n:number) => n*n*n*(n*(n*6-15)+10);
function ramp(f:number, start:number, end:number, from=0, to=1) {
  return from+(to-from)*ease(Math.min(1,Math.max(0,(f-start)/(end-start))));
}
type Point = {f:number; x:number; y:number; z?:number};
function path(frame:number, points:Point[]) {
  const b = points.findIndex(p=>p.f>frame);
  if (b<0) return {...points.at(-1)!, z:points.at(-1)!.z??1};
  if (b===0) return {...points[0],z:points[0].z??1};
  const a=points[b-1], c=points[b];
  return {x:ramp(frame,a.f,c.f,a.x,c.x),y:ramp(frame,a.f,c.f,a.y,c.y),z:ramp(frame,a.f,c.f,a.z??1,c.z??1)};
}
const camera:Point[] = [
  // Times are seconds. Short, settled moves leave the answer time to be read.
  {f:0,x:720,y:382,z:1},{f:1.7,x:720,y:382,z:1},
  {f:2.15,x:305,y:270,z:1.35},{f:4.05,x:305,y:270,z:1.35},
  {f:4.65,x:1160,y:550,z:1.75},{f:8.35,x:1160,y:550,z:1.75},
  {f:8.95,x:1200,y:370,z:1.95},{f:17.95,x:1200,y:370,z:1.95},
  {f:18.35,x:1200,y:430,z:1.85},{f:18.75,x:1200,y:430,z:1.85},
  {f:19.3,x:665,y:444,z:1.4},{f:22.85,x:665,y:444,z:1.4},
  {f:23.4,x:720,y:382,z:1},{f:30,x:720,y:382,z:1},
];
const cursor:Point[] = [
  {f:0,x:655,y:670},{f:1.75,x:655,y:670},{f:2.1,x:160,y:249},
  {f:4.1,x:160,y:249},{f:4.65,x:1212,y:678},{f:7.3,x:1212,y:678},
  {f:7.65,x:1375,y:678},{f:7.85,x:1375,y:678},{f:8.15,x:1350,y:580},
  {f:18.05,x:1350,y:580},{f:18.4,x:1207,y:422},{f:18.75,x:1207,y:422},
  {f:19.15,x:814,y:595},{f:30,x:814,y:595},
];
const captions = {
  ja:[ '5教科を、ひとつの講座に。', '今日わからなかった授業を、開く。', '疑問は、自分の言葉のままで。', '講義をもとに、AIが回答。', '答えのそばに、根拠の時間。', 'クリックして、元の説明へ。', '見て、聞いて、確かめる。自分のペースで。' ],
  en:[ 'Five subjects. One course.', 'Open the lecture you want to revisit.', 'Ask your question in your own words.', 'An answer grounded in your lecture.', 'A source timestamp beside the answer.', 'Click to revisit the explanation.', 'Read. Rewatch. Understand at your own pace.' ],
};
const beats=timeline.captions;
function Icon({type,size=22}:{type:'play'|'send'|'book'|'pause'|'check';size?:number}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {type==='play'?<path d="m8 4 12 8-12 8z" fill="currentColor"/>:type==='pause'?<path d="M8 5v14M16 5v14" strokeWidth="4"/>:type==='send'?<><path d="m21 3-6 18-4-8-8-4z"/><path d="m11 13 10-10"/></>:type==='check'?<path d="m4 12 5 5L20 6"/>:<><path d="M12 5v15M3 4c4-1 6-1 9 1 3-2 5-2 9-1v15c-4-1-6-1-9 1-3-2-5-2-9-1z"/></>}
  </svg>;
}

export function ProductScreen({frame, timing=timeline, locale='ja'}:{frame:number; timing?:typeof timeline; locale?:'ja'|'en'}) {
  const timeline = timing;
  const english = locale === 'en';
  const question = english ? englishAd.question : recording.question;
  const response = english ? englishAd.answer : answer;
  const lessonTitle = (index:number) => english ? englishAd.titles[index] : course.lessons[index].title;
  const selected=frame<timeline.select?0:1;
  const lesson=course.lessons[selected];
  const typed=question.slice(0,Math.floor(interpolate(frame,[timeline.typingStart,timeline.typingEnd],[0,question.length],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})));
  const sent=frame>=timeline.send;
  const answerLength=Math.floor(interpolate(frame,[timeline.answerStart,timeline.answerEnd],[0,response.length],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}));
  const playing=frame>=timeline.playback;
  const activeTime=playing?sourceStart+frame-timeline.playback:0;
  return <div className="product">
    <header className="product-header"><b>VideoQ</b><span>{english?'Course':'講座'} <i>/</i> {english?englishAd.courseName:course.name}</span><em>{english?'Public sharing link':'公開共有リンク'}</em></header>
    <div className="product-columns">
      <aside className="course-list">
        <div className="panel-title"><b>{english?'Videos':'動画一覧'}</b><span>{english?'5 videos':'全5本'}</span></div>
        {course.lessons.map((lesson,i)=><div key={lesson.key} className={`lesson-row ${selected===i?'selected':''}`}>
          <strong>{lessonTitle(i)}</strong><small><Icon type="check" size={12}/>{english?'Ready':'完了'}</small>
        </div>)}
        <div className="course-count">{(english?englishAd.subjects:['国語','数学','理科','社会','英語']).map(subject=><span key={subject}>{subject}</span>)}</div>
      </aside>
      <section className="lesson-player">
        <div className="panel-title"><b>{lessonTitle(selected)}</b></div>
        <div className="lesson-media">
          {english ? <Img src={staticFile(`brand/${selected===0?'writing':'math'}-en-poster.webp`)} style={{width:'100%',height:'100%',objectFit:'contain'}}/> : playing ? <Sequence from={Math.round(timeline.playback*timeline.fps)} layout="none"><OffthreadVideo src={staticFile('lessons/math.mp4')} startFrom={Math.round(sourceStart*timeline.fps)} muted style={{width:'100%',height:'100%',objectFit:'contain'}} /></Sequence>
            : <Img src={staticFile(`lessons/${lesson.key}-poster.webp`)} style={{width:'100%',height:'100%',objectFit:'contain'}}/>}
          <div className="player-controls"><Icon type={playing?'pause':'play'} size={17}/><span>{clock(activeTime)} / 1:00</span><span className="player-fullscreen">⛶</span></div>
          <div className="player-progress"><div style={{width:`${activeTime/60*100}%`}}/></div>
        </div>
      </section>
      <aside className="chat-panel">
        <div className="panel-title"><b>{english?'Chat':'チャット'}</b></div>
        <div className="chat-body">
          {!sent?<div className="assistant"><div className="assistant-name"><Icon type="book" size={15}/> {english?'AI Tutor':'AI 教師'}</div><p>{english?englishAd.greeting:'こんにちは！動画に関する質問にお答えします。何か質問はありますか？'}</p></div>:<>
            <div className="question-bubble">{question}</div>
            <div className="assistant" style={{marginTop:22}}><div className="assistant-name"><Icon type="book" size={15}/> {english?'AI Tutor':'AI 教師'}</div>
              <div className="search-status"><Icon type="check" size={13}/>{english?(frame<timeline.answerStart?'Searching lecture videos':'Lecture videos searched'):(frame<timeline.answerStart?'講義動画を検索しています':'講義動画を検索しました')}</div>
              <div style={{position:'relative'}}>
                <p>{Array.from(response).map((letter,index)=><span key={index} style={{opacity:index<answerLength?1:0}}>{letter}</span>)}<span className="citation" style={{opacity:frame>=timeline.citation?1:0}}> {citation}</span></p>
                {!answerLength&&<div className="typing-dots" style={{position:'absolute',top:0}}>•••</div>}
              </div>
              <div className="feedback" style={{opacity:frame>=timeline.citation?1:0}}>{[false,true].map(down=><svg key={String(down)} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{transform:down?'rotate(180deg)':undefined,marginRight:16}}><path d="M7 10v12H3V10zM7 10l5-8c2 0 3 1 2 4l-1 4h6a2 2 0 0 1 2 2l-2 8a2 2 0 0 1-2 2H7"/></svg>)}</div>
            </div>
          </>}
        </div>
        <div className="composer"><div className={`input ${frame>=timeline.focus&&!sent?'focused':''}`}>
          <span>{!sent?typed:''}{frame>=timeline.typingStart&&!sent&&<i className="caret"/>}</span>
          <div className={`send ${typed&&!sent?'enabled':''}`}><Icon type="send" size={19}/></div>
        </div></div>
      </aside>
    </div>
  </div>;
}

export function StudentDemo({locale='ja', provider=false}:{locale?:'ja'|'en'; provider?:boolean}) {
  const f=useCurrentFrame()/timeline.fps;
  const c=path(f,camera), p=path(f,cursor);
  const fit=1680/1440;
  const tx=Math.max(1680*(1-c.z),Math.min(0,840-c.x*fit*c.z));
  const ty=Math.max(842*(1-c.z),Math.min(0,421-c.y*fit*c.z));
  const outro=ramp(f,timeline.outro,timeline.outroEnd);
  const stage=1-outro;
  const step=Math.max(0,beats.findIndex((b,i)=>f>=b&&f<(beats[i+1]??timeline.duration)));
  const click=[timeline.select,timeline.focus,timeline.send,timeline.sourceClick].map(at=>({age:f-at})).find(v=>v.age>=0&&v.age<.28);
  return <AbsoluteFill className="film">
    <Audio src={staticFile('audio/ambient.mp3')} volume={frame=>.30*interpolate(frame/timeline.fps,[0,.4,28.5,30],[0,1,1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}/>
    {provider ? <ProviderHeader locale={locale}/> : <div className="film-top"><span className="wordmark">VideoQ<span> / STUDY WITH YOUR VIDEOS</span></span><span className="film-tag">{locale==='ja'?'大学生のための、動画の復習。':'Your lectures. Your study partner.'}</span></div>}
    <div className="screen-window" style={{opacity:stage,transform:`translateY(${ramp(f,0,.3,10,0)}px)`}}>
      <div className="screen-camera" style={{transform:`translate(${tx}px,${ty}px) scale(${c.z*fit})`}}><ProductScreen frame={f} locale={locale}/></div>
      {f<timeline.outro&&<div className="cursor" style={{left:p.x*fit*c.z+tx,top:p.y*fit*c.z+ty,opacity:f>timeline.typingStart&&f<timeline.typingEnd?.15:1}}>
        {click&&<div className="click-ring" style={{transform:`translate(-50%,-50%) scale(${.45+click.age/.24})`,opacity:1-click.age/.28}}/>}
        <svg width="36" height="44" viewBox="0 0 30 40"><path d="M3 2v29l7-8 7 15 6-3-7-14h11z" fill="#172f3c" stroke="white" strokeWidth="2.4" strokeLinejoin="round"/></svg>
      </div>}
    </div>
    <div className="film-caption" style={{opacity:stage}}><span>{String(Math.min(step+1,7)+(provider?2:0)).padStart(2,'0')}</span>{provider ? providerCopy[locale].captions[Math.min(step,6)+2] : captions[locale][Math.min(step,6)]}</div>
    {f>=timeline.outro&&<AbsoluteFill className="outro" style={{opacity:outro,pointerEvents:'none'}}>
      <div className="outro-mark">Q</div><p>{provider ? (locale==='ja'?'いつもの教材に、質問できる場所を。':'Give your materials a place for questions.') : (locale==='ja'?'「わからない」を、置いていかない。':'Don’t leave that question behind.')}</p>
      <h1>{provider ? (locale==='ja'?<>講義・研修動画を、<br/>質問に答える窓口へ。</>:<>Your teaching videos.<br/>A place for answers.</>) : (locale==='ja'?<>講義動画が、<br/>あなたの復習パートナーに。</>:<>Your lecture.<br/>Your study partner.</>)}</h1>
      <div className="outro-cta">{provider ? (locale==='ja'?'動画1本で無料で試す':'Try one video for free') : (locale==='ja'?'無料で使ってみる':'Get started for free')} <span>→</span></div><small>{locale==='en'?'videoq.jp/en':'videoq.jp'}</small>
    </AbsoluteFill>}
  </AbsoluteFill>;
}

export function ProviderHeader({locale}:{locale:'ja'|'en'}) {
  return <div className="film-top"><span className="wordmark">VideoQ<span> / TEACHING & TRAINING</span></span><span className="film-tag">{providerCopy[locale].tag}</span></div>;
}
