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

import { reconcileAbandonedUploads, resolveStorageBytesForRelease } from "../src/lib/upload-reconcile";

const ENV = {} as never;

beforeEach(() => {
  listStale.mockReset();
  deleteCascade.mockReset();
  getSize.mockReset();
  processTask.mockReset();
  processTask.mockResolvedValue(true);
});

describe("resolveStorageBytesForRelease", () => {
  it.each([null, "", "videos/1/video_1_999.mp4"])("予約量があるかファイルがない場合はサイズを取得しない: %s", async key => {
    await expect(resolveStorageBytesForRelease(ENV, key)).resolves.toBe(key ? 999 : null);
    expect(getSize).not.toHaveBeenCalled();
  });

  it.each([500, 0, null])("旧形式では実サイズを取得する: %s", async size => {
    getSize.mockResolvedValue(size);
    const key = "videos/1/video_1.mp4";
    await expect(resolveStorageBytesForRelease(ENV, key)).resolves.toBe(size || null);
    expect(getSize).toHaveBeenCalledExactlyOnceWith(ENV, key);
  });

  it("旧形式のサイズ取得失敗では容量不明として削除を続ける", async () => {
    getSize.mockRejectedValue(new Error("Storage unavailable"));
    await expect(resolveStorageBytesForRelease(ENV, "videos/1/video_1.mp4")).resolves.toBeNull();
  });
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
    expect(getSize).not.toHaveBeenCalled();
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
    expect(getSize).not.toHaveBeenCalled();
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
