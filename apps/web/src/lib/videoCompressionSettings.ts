export type CompressionPreset = 'original' | '1080p' | '720p';
export type CompressedVideo = { file: File; dispose: () => Promise<void> };
export type CompressionMessage =
  | { type: 'progress'; percent: number }
  | { type: 'done'; file: File }
  | { type: 'error'; code: string };

export const COMPRESSION_DIRECTORY = 'videoq-upload-compression';

/** Small, even dimensions; never upscale or crop portrait/landscape inputs. */
export function compressionDimensions(width: number, height: number, preset: Exclude<CompressionPreset, 'original'>) {
  const long = preset === '1080p' ? 1920 : 1280;
  const short = preset === '1080p' ? 1080 : 720;
  const scale = Math.min(1, long / Math.max(width, height), short / Math.min(width, height));
  return { width: Math.max(2, Math.floor(width * scale / 2) * 2), height: Math.max(2, Math.floor(height * scale / 2) * 2) };
}
