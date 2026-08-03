import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import {
  listResponse,
  parseLimitOffset,
  singleResponse,
} from "../../src/shared/pagination";
import type { AppEnv } from "../../src/types/bindings";

async function makeCtx(query: Record<string, string> = {}) {
  const app = new Hono<AppEnv>();
  let captured: Parameters<typeof parseLimitOffset>[0] | undefined;

  app.get("/test", (c) => {
    captured = c;
    return c.text("ok");
  });

  const qs = new URLSearchParams(query).toString();
  await app.request(`/test${qs ? `?${qs}` : ""}`);
  return captured!;
}

describe("shared/pagination", () => {
  it("parseLimitOffset defaults to limit=20 offset=0", async () => {
    const c = await makeCtx();
    expect(parseLimitOffset(c)).toEqual({ limit: 20, offset: 0 });
  });

  it("parseLimitOffset clamps limit to max 100", async () => {
    const c = await makeCtx({ limit: "500", offset: "10" });
    expect(parseLimitOffset(c)).toEqual({ limit: 100, offset: 10 });
  });

  it("parseLimitOffset ignores invalid values", async () => {
    const c = await makeCtx({ limit: "abc", offset: "-3" });
    expect(parseLimitOffset(c)).toEqual({ limit: 20, offset: 0 });
  });

  it("listResponse wraps data and meta", () => {
    expect(listResponse([1, 2], { total: 10, limit: 2, offset: 0 })).toEqual({
      data: [1, 2],
      meta: { total: 10, limit: 2, offset: 0 },
    });
  });

  it("singleResponse wraps a single item", () => {
    expect(singleResponse({ id: 1 })).toEqual({ data: { id: 1 } });
  });
});
