import { describe, it, expect } from "vitest";
import { createApp } from "../src/app";

// バインディングに触れないルート（/health）と共通封筒・requestId の単体テスト。
// DB/Hyperdrive を伴う /ready やプロキシは wrangler dev / 統合テストで検証する。
const ENV = {
  ENVIRONMENT: "test",
  LEGACY_API_ORIGIN: "http://localhost:8000",
  CORS_ALLOW_ORIGIN: "http://localhost:5173",
} as unknown as Parameters<ReturnType<typeof createApp>["request"]>[2];

describe("health", () => {
  it("GET /health returns ok envelope with requestId", async () => {
    const app = createApp();
    const res = await app.request("/health", {}, ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { status: string; env: string };
      requestId: string;
    };
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("ok");
    expect(body.data.env).toBe("test");
    expect(body.requestId).toMatch(/[0-9a-f-]{36}/);
    expect(res.headers.get("X-Request-Id")).toBe(body.requestId);
  });

  it("GET /api/health/ は Django 互換エイリアス", async () => {
    const app = createApp();
    const res = await app.request("/api/health/", {}, ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { status: string } };
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("ok");
  });
});
