import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { resourceId, stateIds, uploadUrl, fixtureVideo } from './constraints.mjs';
import {labFetch as fetch, closeLabHttp} from './http.mjs';
import {readAnswerStream, boundedMap, latencySummary} from './measurement.mjs';
const origin = 'http://127.0.0.1:18787';
const password = 'Local-validation-only-2026!';
let cookie;
const real = process.env.ONPREM_REAL_AI === '1';
const selectedCase = process.env.ONPREM_CASE_FILE ? JSON.parse(readFileSync(process.env.ONPREM_CASE_FILE,'utf8')) : null;
// Preserve the public baseline's default locale; only demos select a locale.
const localeHeaders=selectedCase?{'Accept-Language':selectedCase.locale}:{};
const observe=process.env.ONPREM_OBSERVE_DEMO==='1';
assert(!observe||selectedCase,'Observation mode requires an explicit demo case');
const question = real ? '動画では、インターネットで「敵対的環境コース」を検索すると何の住所が出てくると述べていますか？' : 'Where does VideoQ run?';
const normalize = text => text.normalize('NFKC').replace(/\s/g,'');
function seconds(text) {
  const parts=/^(\d+):(\d{2}):(\d{2})(?:[,.](\d{3}))?$/.exec(text);
  assert(parts,'Expected a subtitle timestamp');
  return Number(parts[1])*3600+Number(parts[2])*60+Number(parts[3])+Number(parts[4]??0)/1000;
}
function assessAnswer(answer, testQuestion, videoId) {
  const text=answer.segments.map(s=>s.text).join('');
  if(testQuestion) {
    const actual=normalize(text);
    assert(testQuestion.allTerms.every(t=>actual.includes(normalize(t))),'Answer missed a required demo fact');
    assert(testQuestion.anyTerms.some(t=>actual.includes(normalize(t))),'Answer missed an expected demo value');
    const cited=new Set(answer.segments.flatMap(s=>s.sourceIds));
    const sources=answer.sources.filter(s=>cited.has(s.id));
    assert(sources.length && sources.every(s=>s.video_id===videoId),'Answer cited another video or no evidence');
    assert(sources.some(s=>seconds(s.start_time)<testQuestion.citationRange.end && seconds(s.end_time)>testQuestion.citationRange.start),'Citation did not overlap the reference chapter');
  } else {
    if(real) {assert.match(text,/住所/);assert.match(text,/企業|会社/);}
    else assert.equal(text,'VideoQ runs on Kubernetes.');
    assert.equal(answer.sources.length,1);
    if(!real) assert.equal(answer.sources[0].start_time,'00:00:00,000');
  }
}
function recordAssessment(answer,testQuestion,videoId,kind) {
  let error=null;
  try {assessAnswer(answer,testQuestion,videoId);} catch(caught) {error=caught.message;if(!observe)throw caught;}
  const assessment={kind,questionId:testQuestion?.id??'public-baseline',passed:error===null,error};
  if(selectedCase)appendFileSync(join(dirname(process.argv[3]),'answer-assessments.jsonl'),JSON.stringify({mode:process.argv[2],...assessment})+'\n');
  return assessment;
}
async function auth(route) {
  const response = await fetch(origin+'/api/auth/'+route+'/email', {method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({name:'Onprem Lab',username:'onprem_lab',email:'onprem-lab@example.com',password})});
  assert.equal(response.status,200,await response.clone().text());
  if (route === 'sign-up') return;
  cookie = response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
  assert(cookie);
}
async function rpc(name,input,query=false) {
  const response=await fetch(origin+'/api/trpc/'+name+(query?'?input='+encodeURIComponent(JSON.stringify(input)):''), {method:query?'GET':'POST',signal:AbortSignal.timeout(600000),headers:{'Content-Type':'application/json',...localeHeaders,Origin:origin,Cookie:cookie},...(!query?{body:JSON.stringify(input)}:{})});
  const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body.result.data;
}
async function answer(courseId,testQuestion=selectedCase?.questions[0],videoId) {
  const content=testQuestion?.text??question;
  const answerStarted=performance.now();
  const message=await rpc('chat.send',{messages:[{role:'user',content}],courseId});
  const answerSeconds=(performance.now()-answerStarted)/1000;
  if(selectedCase)appendFileSync(join(dirname(process.argv[3]),'answer-observations.jsonl'),JSON.stringify({mode:process.argv[2],kind:'non-streaming',question:testQuestion,answer:message.answer,answerSeconds})+'\n');
  const normalAssessment=recordAssessment(message.answer,testQuestion,videoId,'non-streaming');
  const streamStarted=performance.now();
  const streamed=await fetch(origin+'/api/chat/messages/stream',{method:'POST',signal:AbortSignal.timeout(600000),headers:{'Content-Type':'application/json',...localeHeaders,Origin:origin,Cookie:cookie},body:JSON.stringify({messages:[{role:'user',content}],course_id:courseId})});
  const stream=await readAnswerStream(streamed,streamStarted,undefined,{requireCitations:!observe});
  if(selectedCase)appendFileSync(join(dirname(process.argv[3]),'answer-observations.jsonl'),JSON.stringify({mode:process.argv[2],kind:'streaming',question:testQuestion,...stream})+'\n');
  const streamAssessment=recordAssessment({segments:[{text:stream.streamedAnswer,sourceIds:stream.citations.map(c=>c.sourceId)}],sources:stream.sources},testQuestion,videoId,'streaming');
  return {answer:message.answer,...stream,answerSeconds,assessments:[normalAssessment,streamAssessment],questionId:testQuestion?.id??'public-baseline'};
}
const mode=process.argv[2]; const statePath=process.argv[3];
if (mode === 'register') {
  const denied = await fetch(origin + '/api/auth/sign-up/email', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ email: 'blocked@example.invalid', password, name: 'Blocked' }) });
  assert.equal(denied.status, 404);
  const activation = JSON.parse(readFileSync(statePath, 'utf8')).activation_url;
  const target = new URL(activation); target.protocol = 'http:'; target.host = '127.0.0.1:18787';
  const response = await fetch(target, { redirect: 'manual' });
  const token = new URL(response.headers.get('location')).searchParams.get('token');
  assert(token, 'account setup must produce a reset token');
  const reset = await fetch(origin + '/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify({ token, newPassword: password }) });
  assert.equal(reset.status, 200);
  await closeLabHttp();
  process.exit(0);
}
await auth('sign-in');
async function upload(testQuestion,earlyEvidence=false) {
  const started=performance.now();
  const bytes=fixtureVideo(readFileSync(process.argv[4]));
  const created=await rpc('videos.requestUpload',{filename:'lab.mp4',contentType:'video/mp4',fileSize:bytes.length,title:'Onprem Lab'});
  const id=resourceId(created.video.id);
  const put=await fetch(uploadUrl(created.upload_url),{method:'PUT',headers:{'Content-Type':'video/mp4'},body:bytes});assert(put.ok);
  await rpc('videos.confirmUpload',{id});
  let video;
  for(let i=0;i<(real?900:120);i++) {
    video=await rpc('videos.get',{id},true);
    if(video.status==='completed')break;
    assert.notEqual(video.status,'error',JSON.stringify(video));
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  assert.equal(video.status,'completed',JSON.stringify(video));
  const processingSeconds=(performance.now()-started)/1000;
  if(real && earlyEvidence)writeFileSync(join(dirname(statePath),'real-ai-result.json'),JSON.stringify({transcript:video.transcript,processingSeconds},null,2));
  if(!selectedCase) {
    if(real) {assert.match(video.transcript,/インターネット|検索/);assert.match(video.transcript,/住所/);}
    else assert(video.transcript.includes('VideoQ runs on Kubernetes.'));
  } else assert(video.transcript?.trim(),'Demo video has no transcript');
  const course=await rpc('courses.create',{name:'Onprem Lab'});
  await rpc('memberships.addVideo',{courseId:resourceId(course.id),videoId:id});
  const ids=stateIds({videoId:id,courseId:course.id});
  if(earlyEvidence)writeFileSync(statePath,JSON.stringify(ids));
  const response=await answer(ids.courseId,testQuestion,ids.videoId);
  return {ids,transcript:video.transcript,processingSeconds,...response,totalSeconds:(performance.now()-started)/1000};
}
if(mode==='upload') {
  const result=await upload(selectedCase?.questions[0],true);
  if(real)writeFileSync(join(dirname(statePath),'real-ai-result.json'),JSON.stringify(result,null,2));
  console.log(observe?'Demo workflow measured; answer quality recorded separately':('Upload, real FFmpeg audio extraction, '+(real?'real-model':'fixture')+' transcription, pgvector indexing, cited Q&A and SSE passed'));
} else if(mode==='benchmark') {
  assert(selectedCase,'An explicit demo case is required');
  const repeats=Number(process.env.ONPREM_BENCHMARK_REPEATS??3);
  assert(Number.isSafeInteger(repeats)&&repeats>=2&&repeats<=20);
  const levels=[1,2],rounds=[];
  const seed=stateIds(JSON.parse(readFileSync(statePath,'utf8')));
  // Prime every question before either timed round. Otherwise the serial
  // round alone pays cold kernels/query-cache costs for unseen questions.
  const warmup=[];
  for(const testQuestion of selectedCase.questions)warmup.push(await answer(seed.courseId,testQuestion,seed.videoId));
  for(const concurrency of levels) {
    const started=performance.now();
    const results=await boundedMap(Array.from({length:repeats},(_,i)=>i),concurrency,async index=>upload(selectedCase.questions[index%selectedCase.questions.length]));
    const elapsedSeconds=(performance.now()-started)/1000;
    rounds.push({concurrency,requests:results.length,elapsedSeconds,completedWorkflowsPerMinute:results.length/elapsedSeconds*60,
      processingSeconds:latencySummary(results.map(r=>r.processingSeconds)),answerSeconds:latencySummary(results.map(r=>r.answerSeconds)),
      firstTextSeconds:latencySummary(results.map(r=>r.firstTextSeconds)),streamSeconds:latencySummary(results.map(r=>r.streamSeconds)),results});
    writeFileSync(join(dirname(statePath),'benchmark.json'),JSON.stringify({interpretation:'Serial versus concurrent complete workflows on the same machine after all-question warmup; fixed round order [1,2], small synthetic sample, not production capacity',warmup,rounds},null,2));
  }
  console.log('Demo workflows completed at concurrency one and two; local benchmark evidence saved');
} else {
  const state=stateIds(JSON.parse(readFileSync(statePath,'utf8')));
  const video=await rpc('videos.get',{id:state.videoId},true);assert.equal(video.status,'completed');
  await answer(state.courseId,selectedCase?.questions[0],state.videoId);
  console.log(observe?'Persisted workflow measured after '+mode+'; answer quality recorded separately':'Persisted user, video, vector search and cited Q&A passed after '+mode);
}
await closeLabHttp();
