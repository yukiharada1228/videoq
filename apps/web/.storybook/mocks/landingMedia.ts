import { bypass, http, HttpResponse } from 'msw';

// Vitest's Storybook static-file middleware does not serve byte ranges.
// Serve the real local lesson with the same range semantics as our media route
// so the interaction test can exercise timestamp seeking (not a mocked player).
export const landingMedia = http.get('/demo/:file', async ({ request, params }) => {
  if (!/^(explain|student-demo)-(ja|en)\.mp4$/.test(String(params.file))) return;
  const response = await fetch(bypass(new Request(request.url)));
  const bytes = await response.arrayBuffer();
  const headers = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
  const range = request.headers.get('Range')?.match(/^bytes=(\d+)-(\d*)$/);
  if (!range) return new HttpResponse(bytes, { headers: { ...headers, 'Content-Length': String(bytes.byteLength) } });
  const start = Number(range[1]);
  const end = Math.min(range[2] ? Number(range[2]) : bytes.byteLength - 1, bytes.byteLength - 1);
  if (start > end) return new HttpResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${bytes.byteLength}` } });
  return new HttpResponse(bytes.slice(start, end + 1), {
    status: 206,
    headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.byteLength}`, 'Content-Length': String(end - start + 1) },
  });
});
