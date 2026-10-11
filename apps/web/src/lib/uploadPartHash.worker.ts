import { md5 } from '@noble/hashes/legacy.js';
import { bytesToHex } from '@noble/hashes/utils.js';

// S3 part ETags are MD5 checksums. This is content comparison for resuming,
// never authentication. Hash off the UI thread with bounded stream chunks.
self.onmessage = async (event: MessageEvent<Blob>) => {
  try {
    const hash = md5.create();
    const reader = event.data.stream().getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        hash.update(value);
      }
    } finally { reader.releaseLock(); }
    self.postMessage({ etag: bytesToHex(hash.digest()) });
  } catch { self.postMessage({ error: true }); }
};
