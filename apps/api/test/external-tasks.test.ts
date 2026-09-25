import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  claimExternalTasks: vi.fn(),
  completeExternalTask: vi.fn(),
  completeStorageCleanupTask: vi.fn(),
  failExternalTask: vi.fn(),
}));
const sqs = vi.hoisted(() => ({ sendSqsMessage: vi.fn() }));
const media = vi.hoisted(() => ({ deleteR2Object: vi.fn() }));

vi.mock("../src/repositories/external-task-repository", () => repository);
vi.mock("../src/lib/sqs", () => sqs);
vi.mock("../src/integrations/media", () => media);

import {
  processExternalTaskById,
  processExternalTasks,
} from "../src/lib/external-tasks";

const env = {} as never;

beforeEach(() => {
  vi.resetAllMocks();
  repository.claimExternalTasks.mockResolvedValue([]);
  repository.completeExternalTask.mockResolvedValue(undefined);
  repository.completeStorageCleanupTask.mockResolvedValue(undefined);
  repository.failExternalTask.mockResolvedValue({ dead: false, leaseLost: false });
  media.deleteR2Object.mockResolvedValue(undefined);
});

describe("external task processor", () => {
  it("SQS送信成功後にタスクを完了する", async () => {
    repository.claimExternalTasks.mockResolvedValueOnce([
      {
        id: 1,
        attempt: 1,
        kind: "sqs_job",
        payload: {
          message: {
            type: "transcribe_video",
            job_id: "job-1",
            payload: { video_id: 42 },
          },
        },
      },
    ]);
    sqs.sendSqsMessage.mockResolvedValue("message-1");

    await expect(processExternalTaskById(env, 1)).resolves.toBe(true);
    expect(sqs.sendSqsMessage).toHaveBeenCalledWith(
      env,
      JSON.stringify({
        type: "transcribe_video",
        job_id: "job-1",
        payload: { video_id: 42 },
      }),
    );
    expect(repository.completeExternalTask).toHaveBeenCalledWith(env, expect.objectContaining({ id: 1, attempt: 1 }));
    expect(repository.failExternalTask).not.toHaveBeenCalled();
  });

  it("SQS送信失敗を完了扱いにせず再試行可能に戻す", async () => {
    repository.claimExternalTasks.mockResolvedValueOnce([
      {
        id: 2,
        attempt: 3,
        kind: "sqs_job",
        payload: {
          message: {
            type: "build_plog",
            job_id: "job-2",
            payload: { video_id: 42 },
          },
        },
      },
    ]);
    sqs.sendSqsMessage.mockResolvedValue(null);

    await expect(processExternalTaskById(env, 2)).resolves.toBe(false);
    expect(repository.completeExternalTask).not.toHaveBeenCalled();
    expect(repository.failExternalTask).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ id: 2, attempt: 3 }),
      expect.stringContaining("SQS"),
    );
  });

  it("R2削除後の容量返却をrepositoryの単一トランザクションへ委譲する", async () => {
    repository.claimExternalTasks.mockResolvedValueOnce([
      {
        id: 3,
        attempt: 2,
        kind: "storage_cleanup",
        payload: {
          file_key: "videos/u/video_1_abc123abc123_4096.mp4",
          user_id: "user-1",
          bytes: 4096,
        },
      },
    ]);

    await expect(processExternalTaskById(env, 3)).resolves.toBe(true);
    expect(media.deleteR2Object).toHaveBeenCalledWith(
      env,
      "videos/u/video_1_abc123abc123_4096.mp4",
    );
    expect(repository.completeStorageCleanupTask).toHaveBeenCalledWith(env, {
      lease: expect.objectContaining({ id: 3, attempt: 2 }),
      userId: "user-1",
      bytes: 4096,
    });
  });

  it("claimできない同時実行者は副作用を実行しない", async () => {
    repository.claimExternalTasks.mockResolvedValue([]);

    await expect(processExternalTasks(env, { limit: 50 })).resolves.toEqual({
      claimed: 0,
      completed: 0,
      failed: 0,
      dead: 0,
    });
    expect(sqs.sendSqsMessage).not.toHaveBeenCalled();
    expect(media.deleteR2Object).not.toHaveBeenCalled();
  });

  it("最大試行回数に達したタスクをdeadとして報告する", async () => {
    repository.claimExternalTasks.mockResolvedValueOnce([
      {
        id: 4,
        attempt: 48,
        kind: "sqs_job",
        payload: {
          message: {
            type: "evaluate_chat_log",
            job_id: "job-dead",
            payload: { chat_log_id: 9 },
          },
        },
      },
    ]);
    sqs.sendSqsMessage.mockResolvedValue(null);
    repository.failExternalTask.mockResolvedValue({ dead: true, leaseLost: false });

    await expect(processExternalTasks(env, { limit: 50 })).resolves.toEqual({
      claimed: 1,
      completed: 0,
      failed: 1,
      dead: 1,
    });
  });

  it("slow delivery does not pre-claim the next task", async () => {
    const first = { id: 10, attempt: 1, kind: "sqs_job", payload: { message: {} } };
    const second = { ...first, id: 11 };
    repository.claimExternalTasks.mockResolvedValueOnce([first]).mockResolvedValueOnce([second]);
    let finishFirst!: (value: string) => void;
    const delivery = new Promise<string>((resolve) => { finishFirst = resolve; });
    sqs.sendSqsMessage.mockReturnValueOnce(delivery).mockResolvedValue("message-2");

    const run = processExternalTasks(env);
    await vi.waitFor(() => expect(sqs.sendSqsMessage).toHaveBeenCalledTimes(1));
    expect(repository.claimExternalTasks).toHaveBeenCalledTimes(1);
    finishFirst("message-1");
    await expect(run).resolves.toEqual({ claimed: 2, completed: 2, failed: 0, dead: 0 });
    const claims = repository.claimExternalTasks.mock.calls;
    expect(claims.every(([, options]) => options.limit === 1)).toBe(true);
    expect(claims[1][1].excludeTaskIds).toEqual([first.id]);
    expect(claims[2][1].excludeTaskIds).toEqual([first.id, second.id]);
  });

  it("does not count a stale completion as successful delivery", async () => {
    repository.claimExternalTasks.mockResolvedValueOnce([
      { id: 12, attempt: 1, kind: "sqs_job", payload: { message: {} } },
    ]);
    sqs.sendSqsMessage.mockResolvedValue("message-1");
    repository.completeExternalTask.mockRejectedValue(new Error("Lease lost"));
    repository.failExternalTask.mockResolvedValue({ dead: false, leaseLost: true });

    await expect(processExternalTasks(env)).resolves.toEqual({
      claimed: 1, completed: 0, failed: 1, dead: 0,
    });
  });
});
