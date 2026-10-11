import { COMPRESSION_DIRECTORY, type CompressionPreset, type CompressedVideo, type CompressionMessage } from './videoCompressionSettings';
export type { CompressionPreset } from './videoCompressionSettings';

export function supportsVideoCompression(): boolean {
  return globalThis.isSecureContext === true && typeof Worker !== 'undefined'
    && typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined'
    && typeof navigator.storage?.getDirectory === 'function';
}

/** The worker reads File slices and writes OPFS. Neither full file enters JS memory. */
export async function compressVideo(
  file: File,
  preset: Exclude<CompressionPreset, 'original'>,
  options: { signal: AbortSignal; onProgress: (percent: number) => void; maxBytes: number },
): Promise<CompressedVideo> {
  options.signal.throwIfAborted();
  if (!supportsVideoCompression()) throw new Error('videos.upload.compression.unsupported');
  const root = await navigator.storage.getDirectory();
  const directory = await root.getDirectoryHandle(COMPRESSION_DIRECTORY, { create: true });
  const name = `${crypto.randomUUID()}.mp4`;
  const dispose = async () => {
    try { await directory.removeEntry(name); }
    catch (error) {
      if (!(error instanceof DOMException && error.name === 'NotFoundError')) {
        console.warn('Could not remove temporary compressed upload');
      }
    }
  };
  options.signal.throwIfAborted();
  const worker = new Worker(new URL('./videoCompression.worker.ts', import.meta.url), { type: 'module' });
  try {
    const result = await new Promise<File>((resolve, reject) => {
      let cancelTimer: ReturnType<typeof setTimeout> | undefined;
      let settled = false;
      const finish = (error?: Error, result?: File) => {
        if (settled) return;
        settled = true;
        clearTimeout(cancelTimer);
        options.signal.removeEventListener('abort', abort);
        worker.terminate();
        if (error) reject(error);
        else resolve(result!);
      };
      const abort = () => {
        if (settled || cancelTimer !== undefined) return;
        worker.postMessage({ type: 'cancel' });
        // A stalled decoder must not trap the dialog or leave a worker running.
        cancelTimer = setTimeout(() => finish(new DOMException('Canceled', 'AbortError')), 5000);
      };
      worker.onmessage = ({ data }: MessageEvent<CompressionMessage>) => {
        if (data.type === 'progress') {
          if (!options.signal.aborted) options.onProgress(data.percent);
        } else if (options.signal.aborted) finish(new DOMException('Canceled', 'AbortError'));
        else if (data.type === 'error') finish(new Error(data.code));
        else finish(undefined, data.file);
      };
      worker.onerror = () => finish(new Error('videos.upload.compression.failed'));
      worker.onmessageerror = () => finish(new Error('videos.upload.compression.failed'));
      options.signal.addEventListener('abort', abort, { once: true });
      worker.postMessage({ type: 'start', file, preset, name, maxBytes: options.maxBytes });
      if (options.signal.aborted) abort();
    });
    return { file: result, dispose };
  } catch (error) {
    worker.terminate();
    await dispose();
    throw error;
  }
}
