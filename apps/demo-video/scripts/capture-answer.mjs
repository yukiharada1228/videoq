// Capture one genuine, anonymous course-scoped answer for the deterministic edit.
// Run only when deliberately refreshing the demo, never as part of rendering.
import { writeFile } from 'node:fs/promises';
const origin = process.env.VIDEOQ_DEMO_ORIGIN || 'http://127.0.0.1:8787';
const slug = 'videoq-campus-basics-v1';
const url = new URL('/api/trpc/courses.shared', origin);
url.searchParams.set('input', JSON.stringify({slug}));
const response = await fetch(url);
const {result} = await response.json();
if (!result?.data || result.data.videos?.length !== 5) throw new Error('The five-lesson course is not ready.');
const question = '微分って、結局何を表すの？2文で簡潔に教えて。';
const stream = await fetch(new URL(`/api/chat/messages/stream?share_slug=${slug}`, origin), {
  method:'POST', headers:{'Content-Type':'application/json'},
  body:JSON.stringify({course_id:result.data.id, messages:[{role:'user',content:question}]}),
  signal:AbortSignal.timeout(120000),
});
if (!stream.ok) throw new Error(`Chat failed: ${stream.status}`);
const sse=await stream.text();
const events=sse.split('\n').filter(line=>line.startsWith('data: ')).map(line=>JSON.parse(line.slice(6)));
if (events.some(event=>event.type==='error') || !events.some(event=>event.type==='done')) throw new Error('The stream did not finish successfully.');
// Keep only owned teaching content and public citation metadata, no user/session data.
const artifact={capturedAt:new Date().toISOString(),course:{id:result.data.id,name:result.data.name,slug,videos:result.data.videos.map(({id,title})=>({id,title}))},question,events:events.map(event=>event.type==='done'?{...event,chat_log_id:null,feedback:null}:event)};
await writeFile(new URL('../content/answer.json',import.meta.url), JSON.stringify(artifact,null,2)+'\n');
console.log(JSON.stringify({question,answer:events.filter(e=>e.type==='text_delta').map(e=>e.text).join(''),sources:events.filter(e=>e.type==='source').map(e=>e.source)},null,2));
