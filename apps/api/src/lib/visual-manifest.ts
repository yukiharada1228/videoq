import { z } from "zod";
import { readMediaBytes } from "../integrations/media";
import type { Bindings } from "../types/bindings";

const schema = z.object({
  version: z.literal(2), video_id: z.number().int().positive().safe(), run_id: z.uuid(),
  duration_seconds: z.number().positive().max(36_000), chunk_seconds: z.literal(60),
  chunk_count: z.number().int().min(1).max(600),
  overview: z.array(z.tuple([
    z.number().int().nonnegative().max(36_000_000), z.number().int().min(0).max(599),
    z.number().int().min(12).max(60 * 256 * 1024 + 64 * 1024),
    z.number().int().positive().max(256 * 1024),
  ])).min(1).max(240),
}).strict();

export const visualChunkKey = (fileKey: string, runId: string, index: number) => `${fileKey}.visual-v2/${runId}/${index}.bin`;

export async function readVisualManifest(env: Bindings, video: { id: number; fileKey: string }, signal: AbortSignal) {
  const bytes = await readMediaBytes(env, `${video.fileKey}.focus-v2.json`, 32 * 1024, signal);
  if (!bytes) return null;
  const plan = schema.parse(JSON.parse(new TextDecoder().decode(bytes)));
  if (plan.video_id !== video.id || plan.chunk_count !== Math.ceil(plan.duration_seconds / 60)) {
    throw new Error("Invalid visual chunk manifest");
  }
  let previous = -1;
  for (const [time, index] of plan.overview) {
    if (time <= previous || time >= plan.duration_seconds * 1000 || index !== Math.floor(time / 60_000) || index >= plan.chunk_count) {
      throw new Error("Invalid visual overview timestamp");
    }
    previous = time;
  }
  return plan;
}

export function jpegBase64(bytes: Uint8Array): string {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) {
    throw new Error("Invalid visual JPEG");
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
