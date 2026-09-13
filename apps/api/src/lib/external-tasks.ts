import { deleteR2Object } from "../integrations/media";
import {
  claimExternalTasks,
  completeExternalTask,
  completeStorageCleanupTask,
  failExternalTask,
  type ClaimedExternalTask,
} from "../repositories/external-task-repository";
import type { Bindings } from "../types/bindings";
import { deliverInvitationEmail } from "./invitation-delivery";
import { sendSqsMessage } from "./sqs";
import { armMaintenance, DISPATCH_SAFETY_NET_MS } from "./task-scheduler";

export type ExternalTaskRunResult = {
  claimed: number;
  completed: number;
  failed: number;
  dead: number;
};

function objectPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("External task payload must be an object.");
  }
  return value as Record<string, unknown>;
}

async function runTask(env: Bindings, task: ClaimedExternalTask): Promise<void> {
  if (task.kind === "sqs_job") {
    const message = objectPayload(task.payload.message);
    const messageId = await sendSqsMessage(env, JSON.stringify(message));
    if (!messageId) throw new Error("SQS job delivery failed.");
    await completeExternalTask(env, task);
    return;
  }

  if (task.kind === "storage_cleanup") {
    const fileKey = task.payload.file_key;
    const userId = task.payload.user_id;
    const bytes = task.payload.bytes;
    if (fileKey !== null && typeof fileKey !== "string") {
      throw new Error("Storage cleanup file_key is invalid.");
    }
    if (typeof userId !== "string") {
      throw new Error("Storage cleanup user_id is invalid.");
    }
    if (bytes !== null && (typeof bytes !== "number" || !Number.isSafeInteger(bytes))) {
      throw new Error("Storage cleanup bytes is invalid.");
    }
    if (fileKey) await deleteR2Object(env, fileKey);
    await completeStorageCleanupTask(env, {
      lease: task,
      userId,
      bytes: bytes as number | null,
    });
    return;
  }

  if (task.kind === "invitation_email") {
    const invitationId = task.payload.invitation_id;
    if (typeof invitationId !== "number" || !Number.isSafeInteger(invitationId)) {
      throw new Error("Invitation email invitation_id is invalid.");
    }
    // 取り消し済み・承認済みの招待は送らずにタスクだけ閉じる。
    const result = await deliverInvitationEmail(env, invitationId, task);
    // 送信をスキップした場合は上の transaction が走らないので、ここで閉じる。
    if (!("delivered" in result)) await completeExternalTask(env, task);
    return;
  }

  throw new Error(`Unsupported external task kind: ${String(task.kind)}`);
}

export async function processExternalTasks(
  env: Bindings,
  options: { limit?: number; taskId?: number; arm?: boolean } = {},
): Promise<ExternalTaskRunResult> {
  const limit = options.taskId === undefined ? (options.limit ?? 50) : 1;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("External task limit must be an integer between 1 and 100.");
  }

  // 着手前に保険のアラームを張る。この実行が Worker ごと落ちても、
  // 掴んだままのリースとバックオフ待ちを TASK_SCHEDULER が拾い直す。
  // 起床を自分で管理する呼び出し元（alarm / 日次 cron）は arm: false。
  if (options.arm !== false) {
    await armMaintenance(env, Date.now() + DISPATCH_SAFETY_NET_MS);
  }
  const result: ExternalTaskRunResult = {
    claimed: 0,
    completed: 0,
    failed: 0,
    dead: 0,
  };

  // Claim only when ready to execute; later tasks must not wait out their lease.
  // Exclude attempted IDs so a slow run does not retry its own failed deliveries.
  const attemptedIds: number[] = [];
  for (let index = 0; index < limit; index += 1) {
    const [task] = await claimExternalTasks(env, {
      limit: 1,
      taskId: options.taskId,
      excludeTaskIds: [...attemptedIds],
    });
    if (!task) break;
    attemptedIds.push(task.id);
    result.claimed += 1;
    try {
      await runTask(env, task);
      result.completed += 1;
    } catch (error) {
      result.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      const failure = await failExternalTask(env, task, message);
      if (failure.dead) result.dead += 1;
      console.error(
        JSON.stringify({
          event: failure.leaseLost ? "external_task_lease_lost"
            : failure.dead ? "external_task_dead" : "external_task_failed",
          taskId: task.id,
          attempt: task.attempt,
          kind: task.kind,
          error: message,
        }),
      );
    }
  }
  return result;
}

export async function processExternalTaskById(
  env: Bindings,
  taskId: number,
): Promise<boolean> {
  const result = await processExternalTasks(env, { taskId });
  return result.completed === 1;
}
