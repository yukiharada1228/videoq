const {test} = require('node:test');
const assert = require('node:assert/strict');
const {resourceId,stateIds,uploadUrl,fixtureVideo} = require('../onprem-lab/constraints.mjs');

test('lab state carries only positive numeric resource IDs',()=>{
  assert.equal(resourceId(12),12);
  assert.deepEqual(stateIds({videoId:1,courseId:2,unexpected:'discard'}),{videoId:1,courseId:2});
  for(const value of [0,-1,1.5,Infinity,NaN,Number.MAX_SAFE_INTEGER+1,'12','../../file',{},null]) assert.throws(()=>resourceId(value));
  for(const value of [null,[],{videoId:1},{videoId:1,courseId:'secret'}]) assert.throws(()=>stateIds(value));
});
test('the lab cannot send its fixture to another origin or URL with credentials',()=>{
  const signed='http://127.0.0.1:19000/bucket/video?signature=lab';
  assert.equal(uploadUrl(signed),signed);
  for(const value of ['https://example.com/video','http://localhost:19000/video','http://127.0.0.1:19001/video','http://127.0.0.1:19000.evil.example/video','http://user:pass@127.0.0.1:19000/video','http://127.0.0.1:19000/video#unexpected','file:///tmp/video']) assert.throws(()=>uploadUrl(value));
});
test('uploads are limited to a small MP4 fixture',()=>{
  const video=Buffer.alloc(16);video.write('ftyp',4);assert.equal(fixtureVideo(video),video);
  for(const bytes of [Buffer.from('private text'),Buffer.alloc(16),Buffer.alloc(2*1024*1024+1)]) assert.throws(()=>fixtureVideo(bytes));
});
