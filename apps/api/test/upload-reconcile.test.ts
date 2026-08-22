import { describe, it, expect, vi, beforeEach } from "vitest";

const listStale = vi.fn();
const deleteCascade = vi.fn();
const getSize = vi.fn();
const processTask = vi.fn();

vi.mock("../src/repositories/video-repository", () => ({
  listStaleUploadingVideos: (...a: unknown[]) => listStale(...a),
  deleteVideoCascade: (...a: unknown[]) => deleteCascade(...a),
}));

vi.mock("../src/integrations/media", () => ({
  getR2ObjectSize: (...a: unknown[]) => getSize(...a),
}));
vi.mock("../src/lib/external-tasks", () => ({
  processExternalTaskById: (...a: unknown[]) => processTask(...a),
}));

import { reconcileAbandonedUploads } from "../src/lib/upload-reconcile";

const ENV = {} as never;

beforeEach(() => {
  listStale.mockReset();
  deleteCascade.mockReset();
  getSize.mockReset();
  processTask.mockReset();
  processTask.mockResolvedValue(true);
});

describe("reconcileAbandonedUploads", () => {
  it("R2 未着でも file key の予約バイトで解放する", async () => {
    listStale.mockResolvedValue([
      {
        id: 10,
        userId: "00000000-0000-4000-8000-000000000005",
        fileKey: "videos/5/video_1700000000000_4096.mp4",
      },
    ]);
    getSize.mockResolvedValue(null);
    deleteCascade.mockResolvedValue({ deleted: true, cleanupTaskId: 91 });

    const r = await reconcileAbandonedUploads(ENV, 2);
    expect(r).toEqual({
      scanned: 1,
      released: 1,
      releasedBytes: 4096,
      errors: 0,
    });
    expect(deleteCascade).toHaveBeenCalledWith(
      ENV,
      10,
      "00000000-0000-4000-8000-000000000005",
      { expectedStatus: "uploading", fallbackStorageBytes: 4096 },
    );
    expect(processTask).toHaveBeenCalledWith(ENV, 91);
  });

  it("R2 実体と違っても予約したサイズだけを解放する", async () => {
    listStale.mockResolvedValue([
      {
        id: 11,
        userId: "00000000-0000-4000-8000-000000000005",
        fileKey: "videos/5/video_1700000000000_4096.mp4",
      },
    ]);
    getSize.mockResolvedValue(4000);
    deleteCascade.mockResolvedValue({ deleted: true, cleanupTaskId: 92 });

    const r = await reconcileAbandonedUploads(ENV);
    expect(r.releasedBytes).toBe(4096);
    expect(processTask).toHaveBeenCalledWith(ENV, 92);
  });

  it("対象なしは zero", async () => {
    listStale.mockResolvedValue([]);
    await expect(reconcileAbandonedUploads(ENV)).resolves.toEqual({
      scanned: 0,
      released: 0,
      releasedBytes: 0,
      errors: 0,
    });
  });

  it("別処理が先に削除した行の容量は二重に返却しない", async () => {
    listStale.mockResolvedValue([
      {
        id: 12,
        userId: "00000000-0000-4000-8000-000000000005",
        fileKey: "videos/5/video_1700000000000_4096.mp4",
      },
    ]);
    getSize.mockResolvedValue(4096);
    deleteCascade.mockResolvedValue({ deleted: false, cleanupTaskId: null });

    await expect(reconcileAbandonedUploads(ENV)).resolves.toEqual({
      scanned: 1,
      released: 0,
      releasedBytes: 0,
      errors: 0,
    });
    expect(processTask).not.toHaveBeenCalled();
  });
});
