import { describe, it, expect } from "vitest";
import { createApp } from "../src/app";

const ENV = {
  ENVIRONMENT: "test",
  CORS_ALLOW_ORIGIN: "http://localhost:5173",
} as unknown as Parameters<ReturnType<typeof createApp>["request"]>[2];

describe("OpenAPI / docs（Django spectacular 置換）", () => {
  it("GET /api/schema/ は OpenAPI JSON", async () => {
    const app = createApp();
    const res = await app.request("/api/schema/", {}, ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(body.openapi).toMatch(/^3\./);
    expect(body.paths["/api/auth/login/"]).toBeTruthy();
    expect(body.paths["/api/v1/chat/completions"]).toBeTruthy();
  });

  it("GET /api/docs/ は HTML", async () => {
    const app = createApp();
    const res = await app.request("/api/docs/", {}, ENV);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("swagger-ui");
  });

  it("未定義パスは 404（プロキシ無し）", async () => {
    const app = createApp();
    const res = await app.request("/api/admin/", {}, ENV);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ detail: "Not found." });
  });
});
