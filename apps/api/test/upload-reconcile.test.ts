import { describe, it, expect, vi, beforeEach } from "vitest";

const listStale = vi.fn();
const deleteCascade = vi.fn();
const getSize = vi.fn();
const deleteObj = vi.fn();
const incr = vi.fn();
const clearOver = vi.fn();

vi.mock("../src/repositories/video-repository", () => ({
  listStaleUploadingVideos: (...a: unknown[]) => listStale(...a),
  deleteVideoCascade: (...a: unknown[]) => deleteCascade(...a),
}));

vi.mock("../src/integrations/media", () => ({
  getR2ObjectSize: (...a: unknown[]) => getSize(...a),
  deleteR2Object: (...a: unknown[]) => deleteObj(...a),
}));

vi.mock("../src/repositories/quota-repository", () => ({
  incrementStorageBytes: (...a: unknown[]) => incr(...a),
  clearOverQuotaIfWithinLimit: (...a: unknown[]) => clearOver(...a),
}));

import { reconcileAbandonedUploads } from "../src/lib/upload-reconcile";

const ENV = {} as never;

beforeEach(() => {
  listStale.mockReset();
  deleteCascade.mockReset();
  getSize.mockReset();
  deleteObj.mockReset();
  incr.mockReset();
  clearOver.mockReset();
});

describe("reconcileAbandonedUploads", () => {
  it("R2 未着でも file key の予約バイトで解放する", async () => {
    listStale.mockResolvedValue([
      {
        id: 10,
        userId: 5,
        fileKey: "videos/5/video_1700000000000_4096.mp4",
      },
    ]);
    getSize.mockResolvedValue(null);
    deleteCascade.mockResolvedValue(undefined);
    deleteObj.mockResolvedValue(undefined);
    incr.mockResolvedValue(undefined);
    clearOver.mockResolvedValue(undefined);

    const r = await reconcileAbandonedUploads(ENV, 2);
    expect(r).toEqual({
      scanned: 1,
      released: 1,
      releasedBytes: 4096,
      errors: 0,
    });
    expect(deleteCascade).toHaveBeenCalledWith(ENV, 10, 5);
    expect(incr).toHaveBeenCalledWith(ENV, 5, -4096);
    expect(clearOver).toHaveBeenCalledWith(ENV, 5);
  });

  it("R2 に実体があればそのサイズで解放する", async () => {
    listStale.mockResolvedValue([
      {
        id: 11,
        userId: 5,
        fileKey: "videos/5/video_1700000000000_4096.mp4",
      },
    ]);
    getSize.mockResolvedValue(4000);
    deleteCascade.mockResolvedValue(undefined);
    deleteObj.mockResolvedValue(undefined);
    incr.mockResolvedValue(undefined);
    clearOver.mockResolvedValue(undefined);

    const r = await reconcileAbandonedUploads(ENV);
    expect(r.releasedBytes).toBe(4000);
    expect(incr).toHaveBeenCalledWith(ENV, 5, -4000);
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
});
