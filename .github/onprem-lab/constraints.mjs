import assert from 'node:assert/strict';

export function resourceId(value) {
  assert(typeof value === 'number' && Number.isSafeInteger(value) && value > 0, 'Expected a positive safe resource ID');
  return Number(value);
}

export function stateIds(value) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Expected lab state');
  return {videoId: resourceId(value.videoId), courseId: resourceId(value.courseId)};
}

export function uploadUrl(value) {
  const url = new URL(value);
  assert.equal(url.origin, 'http://127.0.0.1:19000', 'The lab uploads only to its local S3 port forward');
  assert(!url.username && !url.password && !url.hash, 'Unexpected upload URL credentials or fragment');
  return url.href;
}

export function fixtureVideo(bytes) {
  assert(bytes.length >= 16 && bytes.length <= 2 * 1024 * 1024, 'Expected the small generated lab video');
  assert.equal(bytes.subarray(4, 8).toString('ascii'), 'ftyp', 'Expected an MP4 fixture');
  return bytes;
}
