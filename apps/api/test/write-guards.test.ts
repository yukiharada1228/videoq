import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { isScopeAllowed, requireAuth, requireScope } from "../src/middleware/auth";
import type { AppEnv } from "../src/types/bindings";
import { buildJobMessage } from "../src/lib/job-message";

describe("API キースコープ（ApiKeyScopePermission 相当）", () => {
  it("all は全許可、read_only は読み取りのみ", () => {
    expect(isScopeAllowed("all", "read")).toBe(true);
    expect(isScopeAllowed("all", "write")).toBe(true);
    expect(isScopeAllowed("read_only", "read")).toBe(true);
    expect(isScopeAllowed("read_only", "write")).toBe(false);
    expect(isScopeAllowed("unknown", "read")).toBe(false);
  });

  it.each([undefined, "", "unknown"])("権限が %j の API キーは読み書きとも拒否する", async (accessLevel) => {
    const app = new Hono<AppEnv>();
    app.use("*", requireAuth(async () => ({
      kind: "ok", via: "apikey", userId: "owner", accessLevel,
    })), requireScope());
    app.all("/resource", (c) => c.json({ allowed: true }));

    for (const method of ["GET", "POST"]) {
      const response = await app.request("/resource", { method });
      expect(response.status).toBe(403);
      expect(await response.json()).not.toHaveProperty("allowed");
    }
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
