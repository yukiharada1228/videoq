import { sha256Hex } from "../shared/crypto";
import { sendSqsMessage } from "./sqs";
import type { Bindings } from "../types/bindings";

/** VideoQ worker が受け取る SQS job type。 */
export const JOB_TRANSCRIBE_VIDEO = "transcribe_video" as const;
export const JOB_INDEX_VIDEO_TRANSCRIPT = "index_video_transcript" as const;
export const JOB_REINDEX_VIDEO_TRANSCRIPT = "reindex_video_transcript" as const;
export const JOB_BUILD_PLOG = "build_plog" as const;
export const JOB_DELETE_ACCOUNT_DATA = "delete_account_data" as const;
export const JOB_EVALUATE_CHAT_LOG = "evaluate_chat_log" as const;
export const JOB_REINDEX_ALL_VIDEOS_EMBEDDINGS =
  "reindex_all_videos_embeddings" as const;

export type JobType =
  | typeof JOB_TRANSCRIBE_VIDEO
  | typeof JOB_INDEX_VIDEO_TRANSCRIPT
  | typeof JOB_REINDEX_VIDEO_TRANSCRIPT
  | typeof JOB_BUILD_PLOG
  | typeof JOB_DELETE_ACCOUNT_DATA
  | typeof JOB_EVALUATE_CHAT_LOG
  | typeof JOB_REINDEX_ALL_VIDEOS_EMBEDDINGS;

export type JobMessage = {
  type: JobType;
  job_id: string;
  payload: Record<string, unknown>;
};

/** enqueue ごとの一意な冪等キー。 */
export function newJobId(): string {
  return crypto.randomUUID();
}

export function buildJobMessage(
  type: JobType,
  payload: Record<string, unknown> = {},
  jobId: string = newJobId(),
): JobMessage {
  return { type, job_id: jobId, payload };
}

async function enqueue(
  env: Bindings,
  type: JobType,
  payload: Record<string, unknown> = {},
): Promise<{ messageId: string; jobId: string } | null> {
  const message = buildJobMessage(type, payload);
  const messageId = await sendSqsMessage(env, JSON.stringify(message));
  if (!messageId) return null;
  return { messageId, jobId: message.job_id };
}

export async function enqueueTranscription(
  env: Bindings,
  videoId: number,
): Promise<string | null> {
  const r = await enqueue(env, JOB_TRANSCRIBE_VIDEO, { video_id: videoId });
  return r?.messageId ?? null;
}

export async function enqueueIndexing(
  env: Bindings,
  videoId: number,
): Promise<string | null> {
  const r = await enqueue(env, JOB_INDEX_VIDEO_TRANSCRIPT, { video_id: videoId });
  return r?.messageId ?? null;
}

export async function enqueueReindexTranscript(
  env: Bindings,
  videoId: number,
): Promise<string | null> {
  const r = await enqueue(env, JOB_REINDEX_VIDEO_TRANSCRIPT, { video_id: videoId });
  return r?.messageId ?? null;
}

/** Returns job_id when enqueued; null when SQS is not configured. */
export async function enqueueReindexAllEmbeddings(
  env: Bindings,
): Promise<string | null> {
  const r = await enqueue(env, JOB_REINDEX_ALL_VIDEOS_EMBEDDINGS, {});
  return r?.jobId ?? null;
}

export async function enqueueBuildPlog(
  env: Bindings,
  videoId: number,
): Promise<string | null> {
  const r = await enqueue(env, JOB_BUILD_PLOG, { video_id: videoId });
  return r?.messageId ?? null;
}

export async function enqueueAccountDeletion(
  env: Bindings,
  userId: number,
): Promise<string | null> {
  const r = await enqueue(env, JOB_DELETE_ACCOUNT_DATA, { user_id: userId });
  return r?.jobId ?? null;
}

export async function enqueueEvaluateChatLog(
  env: Bindings,
  chatLogId: number,
): Promise<string | null> {
  const r = await enqueue(env, JOB_EVALUATE_CHAT_LOG, { chat_log_id: chatLogId });
  return r?.messageId ?? null;
}

/** JR-2 台帳の payload_sha256（正規化した type/payload のハッシュ）。 */
export async function payloadSha256(
  type: string,
  payload: Record<string, unknown> = {},
): Promise<string> {
  const canonical = JSON.stringify({ type, payload });
  return sha256Hex(canonical);
}
