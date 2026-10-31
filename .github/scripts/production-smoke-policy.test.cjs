const { test } = require('node:test');
const assert = require('node:assert/strict');
const { synthetic, uploadAllowed, completed, deletable, fixtureValid } = require('./production-smoke-policy.cjs');
test('cleanup requires every synthetic marker and never targets ordinary users', () => {
  const id = 'a9d90493-2339-48c6-ad27-93469e9be70a';
  const user = { id, username: 'ops_smoke_' + id, email: id + '@example.invalid',
    name: 'VideoQ automated smoke check', role: 'user', quota_source: 'admin' };
  assert.equal(synthetic(user), true);
  for (const key of Object.keys(user)) assert.equal(synthetic({ ...user, [key]: 'ordinary' }), false);
});
test('uploads cannot forward bytes to another account, bucket or protocol', () => {
  const valid = 'https://12daec56fdba43f677f2766ee26a5a39.r2.cloudflarestorage.com/videoq-media-prod/clip.mp4?signature=x';
  assert.equal(uploadAllowed(valid), true);
  assert.equal(uploadAllowed(valid.replace('videoq-media-prod', 'other')), false);
  assert.equal(uploadAllowed(valid.replace('https:', 'http:')), false);
  assert.equal(uploadAllowed(valid.replace('.r2.', '.attacker.r2.')), false);
});
test('terminal status follows the application contract and visual work must finish', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync('packages/trpc/src/schema.ts', 'utf8');
  const statuses = [...source.match(/export const VIDEO_STATUSES = \[([\s\S]*?)\] as const/)[1].matchAll(/"([a-z]+)"/g)].map(match => match[1]);
  assert.ok(statuses.includes('completed'));
  assert.equal(statuses.includes('ready'), false);
  for (const status of statuses) {
    assert.equal(completed({ status }), status === 'completed');
    assert.equal(deletable(status), ['completed', 'error', 'uploading'].includes(status));
  }
  assert.equal(completed({ status: 'completed', visual_processing: { status: 'processing' } }), false);
  assert.equal(completed({ status: 'completed', visual_processing: { status: 'error' } }), false);
  assert.equal(completed({ status: 'completed', visual_processing: { status: 'ready' } }), true);
});
test('only the reviewed synthetic fixture may be uploaded', () => {
  const bytes = require('node:fs').readFileSync('.github/operations-tools/fixtures/smoke.mp4');
  assert.equal(fixtureValid(bytes), true);
  const changed = Buffer.from(bytes);
  changed[100] ^= 1;
  assert.equal(fixtureValid(changed), false);
  assert.equal(fixtureValid(Buffer.from('another local file')), false);
});

test('asynchronous cleanup waits for the same safe predicate to become ready', async () => {
  const { waitForCleanup } = require('./production-smoke-policy.cjs');
  let calls = 0; const waits = [];
  assert.equal(await waitForCleanup(async () => ++calls === 3, async ms => waits.push(ms)), true);
  assert.equal(calls, 3); assert.deepEqual(waits, [2000, 2000]);
});
test('active or unfinished cleanup remains a failure after a bounded wait', async () => {
  const { waitForCleanup } = require('./production-smoke-policy.cjs');
  let calls = 0; const waits = [];
  assert.equal(await waitForCleanup(async () => { calls++; return false; }, async ms => waits.push(ms)), false);
  assert.equal(calls, 31); assert.equal(waits.length, 30);
});
test('cleanup errors are not swallowed or retried', async () => {
  const { waitForCleanup } = require('./production-smoke-policy.cjs');
  let calls = 0;
  await assert.rejects(waitForCleanup(async () => { calls++; throw new Error('unavailable'); }, async () => assert.fail('must not wait')), /unavailable/);
  assert.equal(calls, 1);
});

test('AI smoke requires cited transcript evidence from its own uploaded video', () => {
  const { citedAnswerValid } = require('./production-smoke-policy.cjs');
  const valid = { role: 'assistant', answer: { segments: [{ text: 'The clip explains the fixture.', sourceIds: [1] }], sources: [{ id: 1, video_id: 42, evidence_type: 'transcript' }] } };
  assert.equal(citedAnswerValid(valid, 42), true);
  assert.equal(citedAnswerValid(valid, 43), false);
  assert.equal(citedAnswerValid({ ...valid, answer: { ...valid.answer, sources: [] } }, 42), false);
  assert.equal(citedAnswerValid({ ...valid, answer: { ...valid.answer, segments: [{ text: '', sourceIds: [1] }] } }, 42), false);
  assert.equal(citedAnswerValid({ ...valid, answer: { ...valid.answer, sources: [{ id: 1, video_id: 42, evidence_type: 'visual' }] } }, 42), false);
  assert.equal(citedAnswerValid(null, 42), false);
});
