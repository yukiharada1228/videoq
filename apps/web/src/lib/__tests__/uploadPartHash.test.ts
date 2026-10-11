import { Blob } from 'node:buffer';
import { createHash } from 'node:crypto';

it('streams the part and returns the S3-compatible content checksum', async () => {
  const scope = { onmessage: undefined as ((event: { data: Blob }) => Promise<void>) | undefined, postMessage: vi.fn() };
  vi.stubGlobal('self', scope);
  try {
    await import('../uploadPartHash.worker');
    const bytes = new Uint8Array(1024 * 1024 + 13).map((_, i) => i % 251);
    await scope.onmessage!({ data: new Blob([bytes]) });
    expect(scope.postMessage).toHaveBeenCalledExactlyOnceWith({ etag: createHash('md5').update(bytes).digest('hex') });
  } finally { vi.unstubAllGlobals(); }
});
