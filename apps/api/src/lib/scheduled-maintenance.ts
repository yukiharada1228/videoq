import {
  getExternalTaskHealth,
  pruneDeliveryHistory,
} from "../repositories/external-task-repository";
import { failInvitationsWithoutLiveDelivery } from "../repositories/group-invitation-repository";
import type { Bindings } from "../types/bindings";
import { processExternalTasks } from "./external-tasks";
import { reconcileAbandonedUploads } from "./upload-reconcile";

export const DELIVERY_CRON = "*/5 * * * *";
export const RETENTION_CRON = "17 3 * * *";
const BACKLOG_WARNING_SECONDS = 15 * 60;
/** 配送タスクが尽きた招待を failed に倒すまでの猶予。 */
export const INVITATION_QUEUED_STALE_MS = 15 * 60 * 1000;

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

async function observeExternalTaskHealth(env: Bindings) {
  const health = await getExternalTaskHealth(env);
  if (
    health.dead > 0 ||
    (health.oldestPendingSeconds !== null &&
      health.oldestPendingSeconds >= BACKLOG_WARNING_SECONDS)
  ) {
    console.error(JSON.stringify({ event: "external_task_backlog_warning", ...health }));
  }
  return health;
}

async function settleAndReport(
  event: string,
  work: Record<string, Promise<unknown>>,
): Promise<void> {
  const entries = Object.entries(work);
  const settled = await Promise.allSettled(entries.map(([, promise]) => promise));
  const results = Object.fromEntries(
    settled.map((result, index) => [
      entries[index][0],
      result.status === "fulfilled"
        ? result.value
        : { error: errorMessage(result.reason) },
    ]),
  );
  const failures = settled.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );

  const log = JSON.stringify({ event, ...results });
  if (failures.length > 0) {
    console.error(log);
    throw new AggregateError(failures, `${event} failed`);
  }
  console.log(log);
}

/** Cron is only the recovery/maintenance trigger; normal delivery stays immediate. */
export async function runScheduledMaintenance(
  env: Bindings,
  cron: string,
  now = new Date(),
): Promise<void> {
  if (cron === RETENTION_CRON) {
    await settleAndReport("scheduled_delivery_retention", {
      retention: pruneDeliveryHistory(env),
    });
    return;
  }

  if (cron === DELIVERY_CRON) {
    await settleAndReport("scheduled_delivery_recovery", {
      externalTasks: processExternalTasks(env, { limit: 50 }),
      abandonedUploads: reconcileAbandonedUploads(env),
      staleInvitations: failInvitationsWithoutLiveDelivery(
        env,
        now,
        INVITATION_QUEUED_STALE_MS,
      ),
      health: observeExternalTaskHealth(env),
    });
    return;
  }

  throw new Error(`Unknown scheduled maintenance cron: ${cron}`);
}
