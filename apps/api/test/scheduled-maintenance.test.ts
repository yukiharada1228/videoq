import { beforeEach, describe, expect, it, vi } from "vitest";

const tasks = vi.hoisted(() => ({ processExternalTasks: vi.fn() }));
const uploads = vi.hoisted(() => ({ reconcileAbandonedUploads: vi.fn() }));
const repository = vi.hoisted(() => ({
  getExternalTaskHealth: vi.fn(),
  pruneDeliveryHistory: vi.fn(),
}));
const invitations = vi.hoisted(() => ({ failInvitationsWithoutLiveDelivery: vi.fn() }));

vi.mock("../src/lib/external-tasks", () => tasks);
vi.mock("../src/lib/upload-reconcile", () => uploads);
vi.mock("../src/repositories/external-task-repository", () => repository);
vi.mock("../src/repositories/group-invitation-repository", () => invitations);

import {
  INVITATION_QUEUED_STALE_MS,
  runScheduledMaintenance,
} from "../src/lib/scheduled-maintenance";

const env = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  tasks.processExternalTasks.mockResolvedValue({
    claimed: 0,
    completed: 0,
    failed: 0,
    dead: 0,
  });
  uploads.reconcileAbandonedUploads.mockResolvedValue({
    scanned: 0,
    released: 0,
    releasedBytes: 0,
    errors: 0,
  });
  repository.getExternalTaskHealth.mockResolvedValue({
    pending: 0,
    dead: 0,
    oldestPendingSeconds: null,
  });
  repository.pruneDeliveryHistory.mockResolvedValue({
    externalTasks: 0,
    jobExecutions: 0,
  });
  invitations.failInvitationsWithoutLiveDelivery.mockResolvedValue({ failed: 0 });
});

describe("scheduled maintenance", () => {
  it("片方が失敗しても全ての定期処理がsettleするまで待つ", async () => {
    tasks.processExternalTasks.mockRejectedValue(new Error("db unavailable"));

    await expect(
      runScheduledMaintenance(env, "*/5 * * * *"),
    ).rejects.toBeInstanceOf(AggregateError);

    expect(uploads.reconcileAbandonedUploads).toHaveBeenCalledOnce();
    expect(repository.getExternalTaskHealth).toHaveBeenCalledOnce();
  });

  it("配送タスクが尽きた招待を失敗として回収する", async () => {
    const now = new Date("2026-08-22T09:00:00.000Z");
    invitations.failInvitationsWithoutLiveDelivery.mockResolvedValue({ failed: 2 });

    await runScheduledMaintenance(env, "*/5 * * * *", now);

    expect(invitations.failInvitationsWithoutLiveDelivery).toHaveBeenCalledWith(
      env,
      now,
      INVITATION_QUEUED_STALE_MS,
    );
  });

  it("日次cronでは配送履歴だけを削除する", async () => {
    await runScheduledMaintenance(env, "17 3 * * *");

    expect(repository.pruneDeliveryHistory).toHaveBeenCalledOnce();
    expect(tasks.processExternalTasks).not.toHaveBeenCalled();
    expect(uploads.reconcileAbandonedUploads).not.toHaveBeenCalled();
    expect(invitations.failInvitationsWithoutLiveDelivery).not.toHaveBeenCalled();
  });

  it("未知のcronを配送回復として誤実行しない", async () => {
    await expect(runScheduledMaintenance(env, "0 0 * * *")).rejects.toThrow(
      "Unknown scheduled maintenance cron",
    );

    expect(tasks.processExternalTasks).not.toHaveBeenCalled();
    expect(uploads.reconcileAbandonedUploads).not.toHaveBeenCalled();
    expect(repository.pruneDeliveryHistory).not.toHaveBeenCalled();
  });
});
