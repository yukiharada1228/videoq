export function focusCacheFixture(
  times = Array.from({ length: 30 }, (_, i) => i * 1000),
  mutate?: (index: { version: number; video_id: number; duration_seconds: number; sampling_interval_seconds: number; frames: number[][] }) => void,
) {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]);
  const index = { version: 1, video_id: 42, duration_seconds: 30, sampling_interval_seconds: 1,
    frames: times.map((time, i) => [time, i * jpeg.length, jpeg.length]) };
  mutate?.(index);
  const manifest = new TextEncoder().encode(JSON.stringify(index));
  const bytes = new Uint8Array(12 + manifest.length + times.length * jpeg.length);
  bytes.set(new TextEncoder().encode("VQFOC001"));
  new DataView(bytes.buffer).setUint32(8, manifest.length, true);
  bytes.set(manifest, 12);
  times.forEach((_time, i) => bytes.set(jpeg, 12 + manifest.length + i * jpeg.length));
  return bytes;
}
