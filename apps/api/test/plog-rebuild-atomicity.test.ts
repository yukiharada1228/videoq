import { beforeEach, describe, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  getOrCreateActiveBuildJob: vi.fn(),
}));
const externalTasks = vi.hoisted(() => ({ processExternalTaskById: vi.fn() }));

vi.mock("../src/repositories/plog-repository", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  getOrCreateActiveBuildJob: repository.getOrCreateActiveBuildJob,
}));
vi.mock("../src/repositories/video-repository", () => ({
  getVideoTranscriptState: vi.fn().mockResolvedValue({ found: true, hasTranscript: true }),
}));
vi.mock("../src/lib/external-tasks", () => externalTasks);

import { rebuildPlog } from "../src/features/plog/service";

beforeEach(() => vi.clearAllMocks());

describe("PLOG rebuild の冪等性", () => {
  it("既にactiveなジョブがある場合は同じ動画を再投入しない", async () => {
    repository.getOrCreateActiveBuildJob.mockResolvedValue({
      id: 7,
      status: "pending",
      created: false,
      taskId: null,
    });

    await expect(rebuildPlog({} as never, 42, "user-1")).resolves.toMatchObject({
      ok: true,
      job_id: 7,
      status: "pending",
    });
    expect(externalTasks.processExternalTaskById).not.toHaveBeenCalled();
  });

  it("新規build jobと同じtransactionで保存した配送taskを実行する", async () => {
    repository.getOrCreateActiveBuildJob.mockResolvedValue({
      id: 8,
      status: "pending",
      created: true,
      taskId: 91,
    });
    externalTasks.processExternalTaskById.mockResolvedValue(false);

    await expect(rebuildPlog({} as never, 42, "user-1")).resolves.toMatchObject({
      ok: true,
      job_id: 8,
    });
    expect(externalTasks.processExternalTaskById).toHaveBeenCalledWith(
      expect.anything(),
      91,
    );
  });
});
