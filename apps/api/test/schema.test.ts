import { describe, it, expect } from "vitest";
import { createApp } from "../src/app";

const ENV = {
  ENVIRONMENT: "test",
  CORS_ALLOW_ORIGIN: "http://localhost:5173",
} as unknown as Parameters<ReturnType<typeof createApp>["request"]>[2];

describe("OpenAPI / docs", () => {
  it("GET /api/openapi.json は OpenAPI 3.x", async () => {
    const app = createApp();
    const res = await app.request("/api/openapi.json", {}, ENV);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(body.openapi).toMatch(/^3\./);
    expect(Object.keys(body.paths).length).toBeGreaterThan(0);
  });

  it("GET /api/docs は HTML（Scalar）", async () => {
    const app = createApp();
    const res = await app.request("/api/docs", {}, ENV);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html.length).toBeGreaterThan(0);
  });

  it("認証方式を securitySchemes に公開する", async () => {
    const app = createApp();
    const res = await app.request("/api/openapi.json", {}, ENV);
    const body = (await res.json()) as {
      components?: { securitySchemes?: Record<string, unknown> };
    };
    expect(Object.keys(body.components?.securitySchemes ?? {}).sort()).toEqual([
      "ApiKeyAuth",
      "BearerAuth",
      "OAuth2",
    ]);
  });

  it("GET /api/schema はライブ OpenAPI（/api/openapi.json と同系）", async () => {
    const app = createApp();
    const [schema, openapi] = await Promise.all([
      app.request("/api/schema", {}, ENV),
      app.request("/api/openapi.json", {}, ENV),
    ]);
    expect(schema.status).toBe(200);
    expect(openapi.status).toBe(200);
    const schemaBody = (await schema.json()) as {
      openapi: string;
      paths: Record<string, unknown>;
    };
    const openapiBody = (await openapi.json()) as {
      openapi: string;
      paths: Record<string, unknown>;
    };
    expect(schemaBody.openapi).toMatch(/^3\./);
    expect(Object.keys(schemaBody.paths).length).toBe(
      Object.keys(openapiBody.paths).length,
    );
  });

  it("GET /api/redoc は HTML", async () => {
    const app = createApp();
    const res = await app.request("/api/redoc", {}, ENV);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("/api/openapi.json");
  });

  it("未定義パスは 404（プロキシ無し）", async () => {
    const app = createApp();
    const res = await app.request("/api/admin", {}, ENV);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Not found" },
    });
  });
});
