import { beforeEach, describe, expect, it, vi } from "vitest";

const taskRepository = vi.hoisted(() => ({ createJobTask: vi.fn() }));
const processor = vi.hoisted(() => ({ processExternalTaskById: vi.fn() }));

vi.mock("../src/repositories/external-task-repository", () => taskRepository);
vi.mock("../src/lib/external-tasks", () => processor);

import { enqueueReindexAllEmbeddings } from "../src/lib/jobs";

const env = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  taskRepository.createJobTask.mockResolvedValue({ id: 9, created: true });
  processor.processExternalTaskById.mockResolvedValue(false);
});

describe("durable jobs", () => {
  it("送信に失敗してもDBに保存したjob_idを成功応答として返す", async () => {
    const jobId = await enqueueReindexAllEmbeddings(env);

    expect(jobId).toMatch(/[0-9a-f-]{36}/);
    expect(taskRepository.createJobTask).toHaveBeenCalledWith(
      env,
      expect.objectContaining({
        message: expect.objectContaining({
          type: "reindex_all_videos_embeddings",
          job_id: jobId,
          payload: {},
        }),
      }),
    );
    expect(processor.processExternalTaskById).toHaveBeenCalledWith(env, 9);
  });
});
