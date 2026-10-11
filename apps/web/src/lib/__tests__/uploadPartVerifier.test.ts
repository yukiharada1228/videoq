import { createUploadPartVerifier } from '../uploadPartVerifier';

class HashWorker {
  static instance: HashWorker;
  onmessage?: (event: { data: { etag?: string; error?: boolean } }) => void;
  onerror?: () => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { HashWorker.instance = this; }
}
beforeEach(() => vi.stubGlobal('Worker', HashWorker));
afterEach(() => vi.unstubAllGlobals());

it('reuses a worker to compare ETags and terminates it when verification ends', async () => {
  const verifier = createUploadPartVerifier();
  const body = new Blob(['video']);
  const check = verifier.verify(body, 'ABCDEF');
  expect(HashWorker.instance.postMessage).toHaveBeenCalledWith(body);
  HashWorker.instance.onmessage!({ data: { etag: 'abcdef' } });
  expect(await check).toBe(true);
  const mismatch = verifier.verify(body, 'different');
  HashWorker.instance.onmessage!({ data: { etag: 'abcdef' } });
  expect(await mismatch).toBe(false);
  verifier.close();
  expect(HashWorker.instance.terminate).toHaveBeenCalledTimes(1);
});

it.each(['read', 'worker'])('rejects a %s failure so unverified parts cannot be completed', async failure => {
  const verifier = createUploadPartVerifier();
  const check = verifier.verify(new Blob(), 'abcdef');
  if (failure === 'read') HashWorker.instance.onmessage!({ data: { error: true } });
  else HashWorker.instance.onerror!();
  await expect(check).rejects.toThrow();
  verifier.close();
});
