import i18n from '@/i18n/config';

export function createUploadPartVerifier() {
  const worker = new Worker(new URL('./uploadPartHash.worker.ts', import.meta.url), { type: 'module' });
  return {
    verify: (body: Blob, etag: string): Promise<boolean> => new Promise((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<{ etag?: string; error?: boolean }>) => {
        if (event.data.error) reject(new Error(i18n.t('videos.upload.resume.readError')));
        else resolve(event.data.etag === etag.toLowerCase());
      };
      worker.onerror = () => reject(new Error(i18n.t('videos.upload.resume.readError')));
      worker.postMessage(body);
    }),
    close: () => worker.terminate(),
  };
}
