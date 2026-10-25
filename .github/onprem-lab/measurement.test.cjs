const {test}=require('node:test');
const assert=require('node:assert/strict');

test('first answer text is measured before completion across UTF-8/CRLF network chunks',async()=>{
  const {readAnswerStream}=await import('./measurement.mjs');
  const encoder=new TextEncoder();let clock=0;
  const bytes=encoder.encode('data: {"type":"source","source":{"id":1}}\r\n\r\ndata: {"type":"text_delta","text":"住所"}\r\n\r\n');
  const marker=bytes.indexOf(0xe4); // Split a Japanese character, not just ASCII.
  const body={async *[Symbol.asyncIterator](){clock=10;yield bytes.slice(0,marker+1);clock=25;yield bytes.slice(marker+1);clock=100;yield encoder.encode('data: {"type":"citation","sourceId":1}\n\ndata: {"type":"done"}\n\n');}};
  const result=await readAnswerStream({status:200,body},0,()=>clock);
  assert.equal(result.streamedAnswer,'住所');assert.equal(result.firstTextSeconds,.025);assert.equal(result.streamSeconds,.1);
  assert.equal(result.firstCitationSeconds,.1);
});

test('partial, failed, empty and fabricated citation streams cannot pass',async()=>{
  const {readAnswerStream}=await import('./measurement.mjs');
  const variants=[
    [{type:'text_delta',text:'test'}],
    [{type:'error',message:'bad'}],
    [{type:'source',source:{id:1}},{type:'text_delta',text:'test'},{type:'citation',sourceId:2},{type:'done'}],
    [{type:'source',source:{id:1}},{type:'citation',sourceId:1},{type:'done'}],
    [{type:'done'},{type:'text_delta',text:'late'}],
  ];
  for(const events of variants){
    const body=new ReadableStream({start(c){for(const event of events)c.enqueue(new TextEncoder().encode('data: '+JSON.stringify(event)+'\n\n'));c.close();}});
    await assert.rejects(readAnswerStream({status:200,body},0));
  }
});

test('bounded scheduling observes the limit, preserves task order and waits for active work on failure',async()=>{
  const {boundedMap}=await import('./measurement.mjs');let active=0,maximum=0;
  const result=await boundedMap([3,2,1,0],2,async value=>{active++;maximum=Math.max(maximum,active);await new Promise(r=>setTimeout(r,value+1));active--;return value*2;});
  assert.equal(maximum,2);assert.deepEqual(result,[6,4,2,0]);
  let finished=false;
  await assert.rejects(boundedMap([0,1,2],2,async value=>{if(!value)throw new Error('failed');await new Promise(r=>setTimeout(r,10));finished=true;}));
  assert(finished,'Do not clean up the backend while another request is still running');
});

test('small samples report their count and range instead of a misleading p95',async()=>{
  const {latencySummary}=await import('./measurement.mjs');
  const small=latencySummary([3,1,2]);assert.equal(small.median,2);assert.equal(small.p95,null);assert.equal(small.samples,3);
  assert.equal(latencySummary(Array.from({length:20},(_,i)=>i+1)).p95,19);
  assert.throws(()=>latencySummary([NaN]));
});

test('diagnostic mode can measure an uncited answer but still rejects fabricated citations',async()=>{
  const {readAnswerStream}=await import('./measurement.mjs');
  const response=events=>({status:200,body:new ReadableStream({start(c){for(const event of events)c.enqueue(new TextEncoder().encode('data: '+JSON.stringify(event)+'\n\n'));c.close();}})});
  const events=[{type:'text_delta',text:'Unsupported answer'},{type:'done'}];
  await assert.rejects(readAnswerStream(response(events),0));
  const measured=await readAnswerStream(response(events),0,undefined,{requireCitations:false});
  assert.equal(measured.firstCitationSeconds,null);assert.deepEqual(measured.sources,[]);
  await assert.rejects(readAnswerStream(response([events[0],{type:'citation',sourceId:9},events[1]]),0,undefined,{requireCitations:false}));
});
