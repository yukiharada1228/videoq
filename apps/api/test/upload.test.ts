import { describe, it, expect } from "vitest";
import {
  buildPendingUploadFileKey,
  fileExtension,
  isAllowedExtension,
  isAllowedContentType,
  parseReservedBytesFromFileKey,
  unsupportedTypeMessage,
} from "../src/lib/upload";
import { resolveStorageBytesForRelease } from "../src/lib/upload-reconcile";
import { isS3Storage, resolveFileUrl } from "../src/integrations/media";
// os.path.splitext(x)[1].lower() 相当（/tmp/drf_probe5.py で実 Python と一致確認）。
describe("fileExtension — os.path.splitext parity", () => {
  const cases: [string, string][] = [
    ["clip.mp4", ".mp4"],
    ["doc.pdf", ".pdf"],
    ["noext", ""],
    ["a.tar.gz", ".gz"],
    ["VID.MP4", ".mp4"],
    [".mp4", ""], // 隠しファイル: 拡張子なし
    ["archive.", "."],
    ["movie .mov", ".mov"],
    ["dir/sub/x.webm", ".webm"],
  ];
  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () => {
      expect(fileExtension(input)).toBe(expected);
    });
  }
});

describe("upload allow-lists + message", () => {
  it("extensions", () => {
    expect(isAllowedExtension(".mp4")).toBe(true);
    expect(isAllowedExtension(".pdf")).toBe(false);
    expect(isAllowedExtension("")).toBe(false);
  });
  it("mimetypes", () => {
    expect(isAllowedContentType("video/mp4")).toBe(true);
    expect(isAllowedContentType("application/pdf")).toBe(false);
  });
  it("unsupported message uses sorted list", () => {
    expect(unsupportedTypeMessage(".pdf")).toBe(
      "Unsupported file type: '.pdf'. Allowed types: .3gp, .avi, .m4v, .mkv, .mov, .mp4, .mpeg, .mpg, .webm",
    );
  });
});

describe("USE_S3_STORAGE / resolveFileUrl", () => {
  it("isS3Storage は true 文字列のみ", () => {
    expect(isS3Storage({ USE_S3_STORAGE: "true" } as never)).toBe(true);
    expect(isS3Storage({ USE_S3_STORAGE: "false" } as never)).toBe(false);
    expect(isS3Storage({} as never)).toBe(false);
  });

  it("local では /api/media/ 相対パス", async () => {
    await expect(
      resolveFileUrl({ USE_S3_STORAGE: "false" } as never, "videos/1/a.mp4"),
    ).resolves.toBe("/api/media/videos/1/a.mp4");
  });
});

describe("pending upload file key（FR-Q3 予約埋め込み）", () => {
  it("build → parse で予約バイトが復元できる", () => {
    const key = buildPendingUploadFileKey(7, 1_048_576, ".mp4", 1_700_000_000_000);
    expect(key).toBe("videos/7/video_1700000000000_1048576.mp4");
    expect(parseReservedBytesFromFileKey(key)).toBe(1_048_576);
  });

  it("旧形式 key は null（解放は R2 head 頼み）", () => {
    expect(parseReservedBytesFromFileKey("videos/7/video_1700000000000.mp4")).toBeNull();
  });

  it("resolveStorageBytesForRelease は R2 実体を優先", () => {
    const key = "videos/1/video_1_999.mp4";
    expect(resolveStorageBytesForRelease(key, 500)).toBe(500);
    expect(resolveStorageBytesForRelease(key, null)).toBe(999);
    expect(resolveStorageBytesForRelease("videos/1/video_1.mp4", null)).toBeNull();
  });
});
