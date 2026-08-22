import { createJobTask } from "../repositories/external-task-repository";
import type { Bindings } from "../types/bindings";
import { processExternalTaskById } from "./external-tasks";
import {
  buildJobMessage,
  JOB_REINDEX_ALL_VIDEOS_EMBEDDINGS,
  type JobType,
} from "./job-message";

export * from "./job-message";

async function enqueue(
  env: Bindings,
  type: JobType,
  payload: Record<string, unknown> = {},
): Promise<{ jobId: string }> {
  const message = buildJobMessage(type, payload);
  const task = await createJobTask(env, { message });
  await processExternalTaskById(env, task.id);
  return { jobId: message.job_id };
}

/** 永続化したjob_idを返す。SQS未設定・一時障害でもscheduled処理が再配送する。 */
export async function enqueueReindexAllEmbeddings(
  env: Bindings,
): Promise<string> {
  const r = await enqueue(env, JOB_REINDEX_ALL_VIDEOS_EMBEDDINGS, {});
  return r.jobId;
}
