export function focusCacheFixture(
  times = Array.from({ length: 30 }, (_, i) => i * 1000),
  mutate?: (index: { version: number; video_id: number; duration_seconds: number; sampling_interval_seconds: number; candidate_interval_seconds?: number; selection?: string; frames: number[][] }) => void,
  version: 1 | 2 = 2,
) {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0xff, 0xd9]);
  const index = { version, video_id: 42, duration_seconds: 30, sampling_interval_seconds: 1,
    ...(version === 2 ? { candidate_interval_seconds: 0.25, selection: "interval_and_scene_change" } : {}),
    frames: times.map((time, i) => [time, i * jpeg.length, jpeg.length]) };
  mutate?.(index);
  const manifest = new TextEncoder().encode(JSON.stringify(index));
  const bytes = new Uint8Array(12 + manifest.length + times.length * jpeg.length);
  bytes.set(new TextEncoder().encode(`VQFOC00${version}`));
  new DataView(bytes.buffer).setUint32(8, manifest.length, true);
  bytes.set(manifest, 12);
  times.forEach((_time, i) => {
    const frame = jpeg.slice(); frame[4] = i;
    bytes.set(frame, 12 + manifest.length + i * jpeg.length);
  });
  return bytes;
}
