import { sha256Hex } from "../utils/crypto";
import { sendSqsMessage } from "./sqs";
import type { Bindings } from "../types/bindings";

// Celery タスク名（archive/django-backend の contracts/tasks.py と一致）。
export const TRANSCRIBE_VIDEO_TASK =
  "app.entrypoints.tasks.transcription.transcribe_video";
export const INDEX_VIDEO_TRANSCRIPT_TASK =
  "app.entrypoints.tasks.indexing.index_video_transcript";
export const REINDEX_VIDEO_TRANSCRIPT_TASK =
  "app.entrypoints.tasks.reindex_video_transcript.reindex_video_transcript";
export const BUILD_PLOG_TASK = "app.entrypoints.tasks.build_plog.build_plog_artifacts";
export const DELETE_ACCOUNT_DATA_TASK =
  "app.entrypoints.tasks.account_deletion.delete_account_data";
export const EVALUATE_CHAT_LOG_TASK = "app.entrypoints.tasks.evaluation.evaluate_chat_log";
export const REINDEX_ALL_VIDEOS_EMBEDDINGS_TASK =
  "app.entrypoints.tasks.reindexing.reindex_all_videos_embeddings";

/**
 * 非同期ジョブ投入の基盤（PoC #02 / JR-2 設計）。
 *
 * - 冪等キー job_id は enqueue ごとに生成（crypto.randomUUID）。video_id を冪等キーにしない
 *   （正当な再実行を許すため, JR-2）。消費側 Lambda はこの job_id で claim 台帳を確認する。
 * - Celery 独自アダプタ（lambda_handler.py）が受理する最小 plain-JSON を組み立てる:
 *     { headers: { task, id }, body: base64(json([args, kwargs, embed])) }
 * - payload_sha256 は「同一 job_id で別 payload」の事故検出用（JR-2 台帳に保存）。
 *
 * SQS への送信（aws4fetch SigV4）は投入方式（PoC #02 方式 B/C）確定後に別モジュールで実装。
 * ここではメッセージ生成と冪等キーのみを提供する。
 */

export type CeleryJobMessage = {
  headers: { task: string; id: string };
  body: string; // base64(json([args, kwargs, embed]))
};

/** enqueue ごとの一意な冪等キー。 */
export function newJobId(): string {
  return crypto.randomUUID();
}

function toBase64(s: string): string {
  // btoa は Latin1 前提のため、非 ASCII を含む JSON も安全に base64 化する。
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * 既存 Lambda consumer が受理する Celery v2 互換の最小メッセージを組み立てる。
 * args は位置引数、kwargs はキーワード引数。embed は無視されるため {} を入れる。
 */
export function buildCeleryJobMessage(
  task: string,
  args: unknown[],
  jobId: string = newJobId(),
  kwargs: Record<string, unknown> = {},
): CeleryJobMessage {
  const inner = [args, kwargs, {}]; // [args, kwargs, embed]
  return {
    headers: { task, id: jobId },
    body: toBase64(JSON.stringify(inner)),
  };
}

/**
 * transcription タスクを SQS へ投入（enqueue_transcription 相当）。
 * 方式 B の最小メッセージを SendMessage する。MessageId を返す。
 */
export async function enqueueTranscription(
  env: Bindings,
  videoId: number,
): Promise<string | null> {
  const message = buildCeleryJobMessage(TRANSCRIBE_VIDEO_TASK, [videoId]);
  return sendSqsMessage(env, JSON.stringify(message));
}

/** indexing タスクを SQS へ投入（enqueue_indexing 相当）。通常は worker が transcription 後に投入。 */
export async function enqueueIndexing(
  env: Bindings,
  videoId: number,
): Promise<string | null> {
  const message = buildCeleryJobMessage(INDEX_VIDEO_TRANSCRIPT_TASK, [videoId]);
  return sendSqsMessage(env, JSON.stringify(message));
}

/** transcript 変更時の再index タスクを SQS へ投入（enqueue_reindex_transcript 相当）。 */
export async function enqueueReindexTranscript(
  env: Bindings,
  videoId: number,
): Promise<string | null> {
  const message = buildCeleryJobMessage(REINDEX_VIDEO_TRANSCRIPT_TASK, [videoId]);
  return sendSqsMessage(env, JSON.stringify(message));
}

/**
 * 全動画の embedding 再index（Admin `reindex_all_embeddings` / enqueue_reindex_all_videos_embeddings）。
 * job_id（Celery task id）を返す。SQS 未設定時は null。
 */
export async function enqueueReindexAllEmbeddings(
  env: Bindings,
): Promise<string | null> {
  const message = buildCeleryJobMessage(REINDEX_ALL_VIDEOS_EMBEDDINGS_TASK, []);
  const messageId = await sendSqsMessage(env, JSON.stringify(message));
  if (!messageId) return null;
  return message.headers.id;
}

/** PLOG build タスクを SQS へ投入（enqueue_build_plog 相当）。 */
export async function enqueueBuildPlog(
  env: Bindings,
  videoId: number,
): Promise<string | null> {
  const message = buildCeleryJobMessage(BUILD_PLOG_TASK, [videoId]);
  return sendSqsMessage(env, JSON.stringify(message));
}

/** アカウントデータ削除タスクを SQS へ投入（enqueue_account_deletion 相当）。 */
export async function enqueueAccountDeletion(
  env: Bindings,
  userId: number,
): Promise<string | null> {
  const message = buildCeleryJobMessage(DELETE_ACCOUNT_DATA_TASK, [userId]);
  return sendSqsMessage(env, JSON.stringify(message));
}

/**
 * ChatLog の RAGAS 評価タスクを SQS へ投入（dispatch_evaluate_chat_log 相当）。
 * Django は `transaction.on_commit` で発行するため、**ChatLog の保存確定後**に呼ぶこと。
 */
export async function enqueueEvaluateChatLog(
  env: Bindings,
  chatLogId: number,
): Promise<string | null> {
  const message = buildCeleryJobMessage(EVALUATE_CHAT_LOG_TASK, [chatLogId]);
  return sendSqsMessage(env, JSON.stringify(message));
}

/** JR-2 台帳の payload_sha256（正規化した args/kwargs のハッシュ）。 */
export async function payloadSha256(
  task: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {},
): Promise<string> {
  // キー順を固定して正規化（同一入力→同一ハッシュ）
  const canonical = JSON.stringify({ task, args, kwargs });
  return sha256Hex(canonical);
}
