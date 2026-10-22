const ORIGIN = 'https://videoq.jp';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
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
module.exports = { ORIGIN, synthetic, uploadAllowed, completed, deletable };
