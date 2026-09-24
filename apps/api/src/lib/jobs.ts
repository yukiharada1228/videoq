import { createJobTask } from "../repositories/external-task-repository";
import type { Bindings } from "../types/bindings";
import { processExternalTaskById } from "./external-tasks";
import {
  buildJobMessage,
  JOB_REINDEX_ALL_VIDEOS_EMBEDDINGS,
} from "./job-message";

/** 永続化したjob_idを返す。SQS未設定・一時障害でもscheduled処理が再配送する。 */
export async function enqueueReindexAllEmbeddings(
  env: Bindings,
): Promise<string> {
  const message = buildJobMessage(JOB_REINDEX_ALL_VIDEOS_EMBEDDINGS, {});
  const task = await createJobTask(env, { message });
  await processExternalTaskById(env, task.id);
  return message.job_id;
}
