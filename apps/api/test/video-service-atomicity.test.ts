import { beforeEach, describe, expect, it, vi } from "vitest";

const videoRepository = vi.hoisted(() => ({
  getVideoStatus: vi.fn(),
  getVideoFileKey: vi.fn(),
  transitionVideoStatus: vi.fn(),
  getVideoDetail: vi.fn(),
  reserveAndCreatePendingVideo: vi.fn(),
  deleteVideoCascade: vi.fn(),
}));
const quotaRepository = vi.hoisted(() => ({
  getMaxUploadSizeMb: vi.fn(),
}));
const media = vi.hoisted(() => ({
  isS3Storage: vi.fn(),
  presignR2Put: vi.fn(),
  putMediaObject: vi.fn(),
  getR2ObjectSize: vi.fn(),
}));
const externalTasks = vi.hoisted(() => ({
  processExternalTaskById: vi.fn(),
}));

vi.mock("../src/repositories/video-repository", () => videoRepository);
vi.mock("../src/repositories/quota-repository", () => quotaRepository);
vi.mock("../src/integrations/media", () => media);
vi.mock("../src/lib/external-tasks", () => ({
  processExternalTaskById: externalTasks.processExternalTaskById,
}));
vi.mock("../src/repositories/membership-repository", () => ({
  videoOwnedBy: vi.fn(),
}));

import {
  confirmVideoUpload,
  createVideoFromMultipart,
  requestPresignedUpload,
} from "../src/features/videos/service";

const env = { USE_S3_STORAGE: "true" } as never;
const userId = "00000000-0000-4000-8000-000000000005";

beforeEach(() => {
  vi.clearAllMocks();
  quotaRepository.getMaxUploadSizeMb.mockResolvedValue(100);
  videoRepository.reserveAndCreatePendingVideo.mockResolvedValue({
    ok: true,
    videoId: 42,
  });
  media.isS3Storage.mockReturnValue(true);
  media.presignR2Put.mockResolvedValue("https://upload.test/");
  media.putMediaObject.mockResolvedValue(undefined);
  media.getR2ObjectSize.mockResolvedValue(4096);
  videoRepository.getVideoDetail.mockResolvedValue({ id: 42 });
  videoRepository.getVideoFileKey.mockResolvedValue({
    found: true,
    fileKey: "videos/5/video_1700000000000_4096.mp4",
  });
  videoRepository.deleteVideoCascade.mockResolvedValue({
    deleted: true,
    cleanupTaskId: 77,
  });
  externalTasks.processExternalTaskById.mockResolvedValue(true);
});

describe("動画処理の原子性", () => {
  it("uploading→pending の遷移に負けた確認リクエストはジョブを投入しない", async () => {
    videoRepository.getVideoStatus.mockResolvedValue({ found: true, status: "uploading" });
    videoRepository.transitionVideoStatus.mockResolvedValue(false);

    const result = await confirmVideoUpload(env, 42, userId);

    expect(result).toMatchObject({ badState: true });
    expect(externalTasks.processExternalTaskById).not.toHaveBeenCalled();
  });

  it("uploading→pending と同じtransactionで保存した配送taskを実行する", async () => {
    videoRepository.getVideoStatus.mockResolvedValue({ found: true, status: "uploading" });
    videoRepository.transitionVideoStatus.mockResolvedValue({
      videoId: 42,
      taskId: 79,
      jobId: "job-79",
    });

    await expect(confirmVideoUpload(env, 42, userId)).resolves.toMatchObject({
      video: { id: 42 },
    });
    expect(externalTasks.processExternalTaskById).toHaveBeenCalledWith(env, 79);
  });

  it("アップロード実サイズが予約と違えば削除した勝者だけが予約を返却する", async () => {
    videoRepository.getVideoStatus.mockResolvedValue({ found: true, status: "uploading" });
    media.getR2ObjectSize.mockResolvedValue(8192);

    const result = await confirmVideoUpload(env, 42, userId);

    expect(result).toMatchObject({ badState: true });
    expect(videoRepository.deleteVideoCascade).toHaveBeenCalledWith(
      env,
      42,
      userId,
      { expectedStatus: "uploading", fallbackStorageBytes: 4096 },
    );
    expect(externalTasks.processExternalTaskById).toHaveBeenCalledWith(env, 77);
    expect(videoRepository.transitionVideoStatus).not.toHaveBeenCalled();
    expect(externalTasks.processExternalTaskById).toHaveBeenCalledTimes(1);
  });

  it("オブジェクト未着では確定もジョブ投入もしない", async () => {
    videoRepository.getVideoStatus.mockResolvedValue({ found: true, status: "uploading" });
    media.getR2ObjectSize.mockResolvedValue(null);

    const result = await confirmVideoUpload(env, 42, userId);

    expect(result).toMatchObject({ badState: true });
    expect(videoRepository.transitionVideoStatus).not.toHaveBeenCalled();
    expect(externalTasks.processExternalTaskById).not.toHaveBeenCalled();
  });

  it("容量予約とpending動画作成は同じtransactionで失敗する", async () => {
    videoRepository.reserveAndCreatePendingVideo.mockRejectedValue(
      new Error("db down"),
    );

    await expect(
      requestPresignedUpload(env, userId, {
        filename: "clip.mp4",
        content_type: "video/mp4",
        file_size: 4096,
        title: "clip",
        description: "",
      }),
    ).rejects.toThrow("db down");
    expect(videoRepository.deleteVideoCascade).not.toHaveBeenCalled();
    expect(externalTasks.processExternalTaskById).not.toHaveBeenCalled();
  });

  it("署名URL作成に失敗したらpending動画を削除した勝者だけが容量を返却する", async () => {
    media.presignR2Put.mockRejectedValue(new Error("sign failed"));

    await expect(
      requestPresignedUpload(env, userId, {
        filename: "clip.mp4",
        content_type: "video/mp4",
        file_size: 4096,
        title: "clip",
        description: "",
      }),
    ).rejects.toThrow("sign failed");
    expect(videoRepository.deleteVideoCascade).toHaveBeenCalledWith(
      env,
      42,
      userId,
      { expectedStatus: "uploading", fallbackStorageBytes: 4096 },
    );
    expect(media.presignR2Put).toHaveBeenCalledWith(
      env,
      expect.stringContaining("_4096.mp4"),
      "video/mp4",
      4096,
    );
    expect(externalTasks.processExternalTaskById).toHaveBeenCalledWith(env, 77);
  });

  it("multipartのR2保存失敗時は先に作った動画と容量を耐久taskで戻す", async () => {
    media.isS3Storage.mockReturnValue(false);
    media.putMediaObject.mockRejectedValue(new Error("R2 down"));
    const file = new File(["abcd"], "clip.mp4", { type: "video/mp4" });

    const result = await createVideoFromMultipart(env, userId, {
      file,
      title: "clip",
      description: "",
    });

    expect(result).toMatchObject({ ok: false, status: 500 });
    expect(videoRepository.deleteVideoCascade).toHaveBeenCalledWith(
      env,
      42,
      userId,
      { expectedStatus: "uploading", fallbackStorageBytes: 4 },
    );
    expect(externalTasks.processExternalTaskById).toHaveBeenCalledWith(env, 77);
  });
});
