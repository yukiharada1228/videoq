import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=fileURLToPath(new URL('../../web/public/demo/',import.meta.url));
const review=fileURLToPath(new URL('../review/',import.meta.url));
await mkdir(output,{recursive:true}); await mkdir(review,{recursive:true});
const serveUrl=await bundle({entryPoint:root+'src/index.tsx',publicDir:root+'public'});
const timeline=JSON.parse(await readFile(root+'content/timeline.json','utf8'));
// Use Remotion's pinned Headless Shell and lossless frames. The installed desktop
// Chrome produced intermittent tiled screenshots even on otherwise static frames.
const browserOptions={chromeMode:'headless-shell',browserExecutable:process.env.REMOTION_BROWSER_EXECUTABLE,chromiumOptions:{gl:'angle'}};
const captions={
 ja:['5教科を、ひとつの講座に。','今日わからなかった授業を、開く。','疑問は、自分の言葉のままで。','講義をもとに、AIが回答。','答えのそばに、根拠の時間。','クリックして、元の説明へ。','見て、聞いて、確かめる。自分のペースで。','講義動画が、あなたの復習パートナーに。無料で使ってみる。'],
 en:['Five subjects. One course.','Open the lecture you want to revisit.','Ask your question in your own words.','An answer grounded in your lecture.','A source timestamp beside the answer.','Click to revisit the explanation.','Read. Rewatch. Understand at your own pace.','Your lecture. Your study partner. Get started for free.'],
};
const timings=timeline.captions;
const time=n=>`00:${Math.floor(n/60).toString().padStart(2,'0')}:${(n%60).toFixed(3).padStart(6,'0')}`;
const {values}=parseArgs({options:{stills:{type:'boolean'},'assets-only':{type:'boolean'},locale:{type:'string'}}});
if(values.locale && !['ja','en'].includes(values.locale)) throw new Error('Locale must be ja or en.');
const stillsOnly=values.stills;
for(const locale of (values.locale?[values.locale]:stillsOnly?['ja']:['ja','en'])) {
 const inputProps={locale};
 const composition=await selectComposition({serveUrl,id:'StudentDemo',inputProps,...browserOptions});
 if(locale==='ja'&&!values['assets-only']) for(const second of timeline.reviewSeconds) {
  const frame=Math.round(second*timeline.fps);
  await renderStill({serveUrl,composition,inputProps,...browserOptions,frame,output:review+`frame-${frame}.png`,imageFormat:'png'});
 }
 if(stillsOnly) continue;
 let last=-1;
 const destination=output+`student-demo-${locale}.mp4`;
 if(!values['assets-only']) {
  const candidate=review+`student-demo-${locale}.mp4`;
  await renderMedia({serveUrl,composition,inputProps,...browserOptions,codec:'h264',imageFormat:'png',crf:21,x264Preset:'fast',concurrency:2,
   outputLocation:candidate,onProgress:({progress})=>{const value=Math.floor(progress*10);if(value!==last){last=value;console.log(`${locale}: ${value*10}%`);}}
  });
  if((await stat(candidate)).size>16*1024*1024) throw new Error('Demo exceeds the bounded media route limit.');
  // Inspect every encoded frame before replacing the LP asset; failures leave
  // the previous video intact and preserve the candidate for diagnosis.
  execFileSync('python3',[root+'scripts/verify-video.py',candidate],{stdio:'inherit'});
  await rename(candidate,destination);
 }
 const poster=review+`poster-${locale}.png`;
 await renderStill({serveUrl,composition,inputProps,...browserOptions,frame:Math.round(timeline.poster*timeline.fps),output:poster,imageFormat:'png'});
 execFileSync('python3',['-c','from PIL import Image; import sys; Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2], "WEBP", quality=88)',poster,output+`student-demo-${locale}-poster.webp`]);
 await writeFile(output+`student-demo-${locale}.vtt`,'WEBVTT\n\n'+captions[locale].map((text,i)=>`${time(timings[i])} --> ${time(timings[i+1])}\n${text}\n`).join('\n'));
}
console.log(stillsOnly?'Review frames ready.':'Requested films, posters and captions are ready.');
