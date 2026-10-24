import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resourceId, stateIds, uploadUrl, fixtureVideo } from './constraints.mjs';
const origin = 'http://127.0.0.1:18787';
const password = 'Local-validation-only-2026!';
let cookie;
async function auth(route) {
  const response = await fetch(origin+'/api/auth/'+route+'/email', {method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({name:'Onprem Lab',username:'onprem_lab',email:'onprem-lab@example.com',password})});
  assert.equal(response.status,200,await response.clone().text());
  if (route === 'sign-up') return;
  cookie = response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
  assert(cookie);
}
async function rpc(name,input,query=false) {
  const response=await fetch(origin+'/api/trpc/'+name+(query?'?input='+encodeURIComponent(JSON.stringify(input)):''), {method:query?'GET':'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:cookie},...(!query?{body:JSON.stringify(input)}:{})});
  const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body.result.data;
}
async function answer(courseId) {
  const message=await rpc('chat.send',{messages:[{role:'user',content:'Where does VideoQ run?'}],courseId});
  assert.equal(message.answer.segments[0].text,'VideoQ runs on Kubernetes.');
  assert.equal(message.answer.sources.length,1);
  assert.equal(message.answer.sources[0].start_time,'00:00:00,000');
  const streamed=await fetch(origin+'/api/chat/messages/stream',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:cookie},body:JSON.stringify({messages:[{role:'user',content:'Where does VideoQ run?'}],course_id:courseId})});
  assert.equal(streamed.status,200);
  const events=(await streamed.text()).split('\n').filter(l=>l.startsWith('data: ')).map(l=>JSON.parse(l.slice(6)));
  assert(events.some(e=>e.type==='text_delta'&&e.text.includes('VideoQ')));
  assert(events.some(e=>e.type==='citation'&&e.sourceId===1));
  assert(events.some(e=>e.type==='done'));
  assert(!events.some(e=>e.type==='error'),JSON.stringify(events));
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
  process.exit(0);
}
await auth('sign-in');
if(mode==='upload') {
  const bytes=fixtureVideo(readFileSync(process.argv[4]));
  const created=await rpc('videos.requestUpload',{filename:'lab.mp4',contentType:'video/mp4',fileSize:bytes.length,title:'Onprem Lab'});
  const id=resourceId(created.video.id);
  const put=await fetch(uploadUrl(created.upload_url),{method:'PUT',headers:{'Content-Type':'video/mp4'},body:bytes});assert(put.ok);
  await rpc('videos.confirmUpload',{id});
  let video;
  for(let i=0;i<120;i++) {
    video=await rpc('videos.get',{id},true);
    if(video.status==='completed')break;
    assert.notEqual(video.status,'error',JSON.stringify(video));
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  assert.equal(video.status,'completed',JSON.stringify(video));assert(video.transcript.includes('VideoQ runs on Kubernetes.'));
  const course=await rpc('courses.create',{name:'Onprem Lab'});
  await rpc('memberships.addVideo',{courseId:resourceId(course.id),videoId:id});
  writeFileSync(statePath,JSON.stringify(stateIds({videoId:id,courseId:course.id})));
  await answer(resourceId(course.id));
  console.log('Upload, real FFmpeg audio extraction, fixture transcription, pgvector indexing, cited Q&A and SSE passed');
} else {
  const state=stateIds(JSON.parse(readFileSync(statePath,'utf8')));
  const video=await rpc('videos.get',{id:state.videoId},true);assert.equal(video.status,'completed');
  await answer(state.courseId);
  console.log('Persisted user, video, vector search and cited Q&A passed after '+mode);
}
