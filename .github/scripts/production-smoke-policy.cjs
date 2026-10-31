const ORIGIN = 'https://videoq.jp';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function fixtureValid(bytes) {
  return bytes.length >= 1000 && bytes.length <= 2_000_000 &&
    require('node:crypto').createHash('sha256').update(bytes).digest('hex') ===
      'd58c4123ef33a36562a4382bb2a36bff00e3151fe05593e937b39368df023671';
}
function synthetic(user) {
  return UUID.test(user.id) && user.username === 'ops_smoke_' + user.id &&
    user.email === user.id + '@example.invalid' && user.name === 'VideoQ automated smoke check' &&
    user.role === 'user' && user.quota_source === 'admin';
}
function uploadAllowed(value) {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password &&
    url.host === '12daec56fdba43f677f2766ee26a5a39.r2.cloudflarestorage.com' &&
    url.pathname.startsWith('/videoq-media-prod/');
}
function completed(video) {
  return video.status === 'completed' &&
    !['processing', 'error'].includes(video.visual_processing?.status);
}
function deletable(status) {
  return ['completed', 'error', 'uploading'].includes(status);
}
// Re-check the same safe cleanup predicate while background storage tasks settle.
// Never force deletion, retry exceptions, or create another upload while waiting.
async function waitForCleanup(cleanup, wait) {
  for (let attempt = 0; attempt < 31; attempt++) {
    if (await cleanup()) return true;
    if (attempt < 30) await wait(2000);
  }
  return false;
}
module.exports = { waitForCleanup, ORIGIN, synthetic, uploadAllowed, completed, deletable, fixtureValid };

// Reject fallback prose and unrelated citations as evidence of inference readiness.
function citedAnswerValid(message, videoId) {
  const answer = message?.answer;
  if (message?.role !== 'assistant' || !Array.isArray(answer?.segments) || !Array.isArray(answer?.sources)) return false;
  const ids = new Set(answer.sources.filter(source => source.video_id === videoId && source.evidence_type !== 'visual').map(source => source.id));
  return answer.segments.some(segment => typeof segment.text === 'string' && segment.text.trim() &&
    Array.isArray(segment.sourceIds) && segment.sourceIds.some(id => ids.has(id)));
}
module.exports.citedAnswerValid = citedAnswerValid;
