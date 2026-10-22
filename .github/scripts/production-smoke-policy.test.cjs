const { test } = require('node:test');
const assert = require('node:assert/strict');
const { synthetic, uploadAllowed } = require('./production-smoke-policy.cjs');
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
