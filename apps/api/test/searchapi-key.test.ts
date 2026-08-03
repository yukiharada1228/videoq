import { describe, it, expect, vi } from "vitest";
import { authRoutes } from "../src/features/auth/routes";
import { signAccessToken } from "./helpers/auth";
import { executeFakePgQuery, type PgQueryInput } from "./helpers/pg-fake";

vi.mock("pg", () => {
  class FakeClient {
    async connect() {}
    async end() {}
    async query(sqlOrConfig: unknown, args: unknown[] = []) {
      return executeFakePgQuery({
        sqlOrConfig: sqlOrConfig as PgQueryInput,
        args,
        rowsFor: () => [],
      });
    }
  }
  return { default: { Client: FakeClient } };
});

const SECRET = "test-searchapi-secret";
const ENV = {
  ENVIRONMENT: "development",
  AUTH_JWT_SECRET: SECRET,
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
} as unknown as Record<string, unknown>;

async function accessToken() {
  return signAccessToken(SECRET);
}

const put = async (body: unknown) => ({
  method: "PUT",
  headers: {
    authorization: `Bearer ${await accessToken()}`,
    "content-type": "application/json",
  },
  body: JSON.stringify(body),
});

describe("/api/auth/searchapi-key のガードと serializer（DB 到達前）", () => {
  it("認証なしは 401（GET/PUT/DELETE）", async () => {
    for (const method of ["GET", "PUT", "DELETE"]) {
      const res = await authRoutes.request("/api/auth/searchapi-key", { method }, ENV);
      expect(res.status, method).toBe(401);
    }
  });

  it("api_key 欠落 → 400 required", async () => {
    const res = await authRoutes.request("/api/auth/searchapi-key", await put({}), ENV);
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.details.api_key).toEqual(["Invalid input: expected string, received undefined"]);
  });

  it("空文字は CharField の blank エラー", async () => {
    const res = await authRoutes.request("/api/auth/searchapi-key", await put({ api_key: "" }), ENV);
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.details.api_key).toEqual(["Too small: expected string to have >=1 characters"]);
  });

  it("空白のみは trim_whitespace 後に blank 扱い", async () => {
    const res = await authRoutes.request("/api/auth/searchapi-key", await put({ api_key: "   " }), ENV);
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.details.api_key).toEqual(["Too small: expected string to have >=1 characters"]);
  });

  it("null は null エラー", async () => {
    const res = await authRoutes.request("/api/auth/searchapi-key", await put({ api_key: null }), ENV);
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.details.api_key).toEqual(["Invalid input: expected string, received null"]);
  });
});
