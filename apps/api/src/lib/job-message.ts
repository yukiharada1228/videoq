/** Workerへ渡すジョブメッセージ。DB outboxにも同じ形で保存する。 */
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

