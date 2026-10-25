import {describe,it,expect,vi,afterEach} from 'vitest';
import {chatAnswerText} from '@videoq/trpc/chat';
import type {Bindings} from '../src/types/bindings';
import type {SceneHit} from '../src/repositories/vector-repository';

// An explicitly local, opt-in model/component check. Retrieval is fixed here;
// the Mac acceptance runner separately exercises actual DB/vector retrieval.
const enabled=process.env.LOCAL_DEMO_LIVE==='1';
const base=process.env.LOCAL_DEMO_LLM_URL??'http://127.0.0.1:18000/v1';
if(enabled){const url=new URL(base);if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password)throw new Error('Local demo inference only accepts the loopback model server');}
const env={OPENAI_API_KEY:'local-demo',OPENAI_BASE_URL:base,LLM_MODEL:'videoq-chat',LLM_REASONING_EFFORT:'none',
  LLM_SEPARATE_TOOL_SCHEMA:'true',LLM_REQUEST_TIMEOUT_MS:'600000',LLM_STREAM_TIMEOUT_MS:'600000',
  VIDEO_VISUAL_ENABLED:'false',DEPLOYMENT_EDITION:'onprem'} as Bindings;
const search=vi.fn(async()=>scenes);
vi.mock('../src/repositories/vector-repository',()=>({openSceneSearch:async()=>({search,close:async()=>{}})}));
vi.mock('../src/repositories/course-repository',()=>({getCourseInfo:async()=>({id:1,name:'Onprem Lab',description:'',video_count:1,videos:[{id:1,title:'Onprem Lab',description:'',status:'completed',order:0}],videos_meta:{total:1,next_offset:null}})}));
const {runRag,streamRag}=await import('../src/lib/rag');
const scenes:SceneHit[]=[
  ['これは架空の研修デモです。','00:00:00,000','00:00:02,280'],
  ['旅費の申請は、出場の3営業日前までに総務','00:00:02,280','00:00:06,240'],
  ['へ提出します。','00:00:06,240','00:00:07,680'],
  ['領収書は経費管理システムに登録し、原本は','00:00:07,680','00:00:11,930'],
  ['1年間保管します。','00:00:11,930','00:00:13,920'],
  ['機密情報を含む動画は、社内のサーバーだけ','00:00:13,920','00:00:17,550'],
  ['で処理し、社外へ送信しません。','00:00:17,550','00:00:20,520'],
].map(([content,startTime,endTime])=>({content,startTime,endTime,videoId:1,videoTitle:'Onprem Lab'}));
const cases=[
  {question:'旅費の申請は、出張の何日前までに、どこへ提出しますか？',terms:['営業日','総務'],value:/3|三/},
  {question:'領収書はどこに登録し、原本をどのくらい保管しますか？',terms:['経費管理システム'],value:/1年|一年/},
  {question:'機密情報を含む動画はどこで処理し、社外へ送信しますか？',terms:['社内','社外'],value:/しない|しません|せず|禁止/},
];
afterEach(()=>vi.clearAllMocks());
describe.skipIf(!enabled).each([false,true])('local model demo retrieval (stream=%s)',stream=>{
  it.each(cases)('$question',async({question,terms,value})=>{
    const params={messages:[{role:'user',content:question}],ownerUserId:'00000000-0000-4000-8000-000000000005',courseId:1,videoIds:[1],locale:'ja'};
    let answer;
    if(stream){for await(const chunk of streamRag(env,params))if('final'in chunk)answer=chunk.final.answer;}
    else answer=(await runRag(env,params)).answer;
    expect(answer).toBeDefined();
    if(!answer)throw new Error('Missing answer');
    console.log(JSON.stringify({question,stream,answer}));
    const text=chatAnswerText(answer).normalize('NFKC').replace(/\s/g,'');
    for(const term of terms)expect(text).toContain(term);
    expect(text).toMatch(value);expect(search).toHaveBeenCalled();
    expect(answer.sources.length).toBeGreaterThan(0);
    expect(answer.segments.flatMap(s=>s.sourceIds).length).toBeGreaterThan(0);
  },180000);
});

describe.skipIf(!enabled).each([false,true])('local model metadata (stream=%s)',stream=>{
  it('answers the video count from course metadata',async()=>{
    const params={messages:[{role:'user',content:'この講座の動画は何本ありますか？'}],ownerUserId:'00000000-0000-4000-8000-000000000005',courseId:1,videoIds:[1],locale:'ja'};
    let answer;
    if(stream){for await(const chunk of streamRag(env,params))if('final'in chunk)answer=chunk.final.answer;}
    else answer=(await runRag(env,params)).answer;
    expect(answer).toBeDefined();if(!answer)throw new Error('Missing answer');
    console.log(JSON.stringify({question:params.messages[0].content,stream,answer}));
    expect(chatAnswerText(answer).normalize('NFKC')).toMatch(/1|一/);
    expect(search).not.toHaveBeenCalled();expect(answer.sources).toEqual([]);
  },180000);
});
