import { describe, it, expect } from "vitest";
import { isScopeAllowed } from "../src/middleware/auth";
import { buildJobMessage } from "../src/lib/jobs";

describe("API キースコープ（ApiKeyScopePermission 相当）", () => {
  it("all は全許可、read_only は {read, chat_write} のみ", () => {
    expect(isScopeAllowed("all", "read")).toBe(true);
    expect(isScopeAllowed("all", "write")).toBe(true);
    expect(isScopeAllowed("all", "chat_write")).toBe(true);
    expect(isScopeAllowed("read_only", "read")).toBe(true);
    expect(isScopeAllowed("read_only", "chat_write")).toBe(true);
    expect(isScopeAllowed("read_only", "write")).toBe(false);
    expect(isScopeAllowed("unknown", "read")).toBe(false);
  });
});

describe("ジョブ投入（native JSON）", () => {
  it("type / job_id / payload を組み立てる", () => {
    const m = buildJobMessage(
      "transcribe_video",
      { video_id: 123 },
      "fixed-job-id",
    );
    expect(m).toEqual({
      type: "transcribe_video",
      job_id: "fixed-job-id",
      payload: { video_id: 123 },
    });
  });
});
