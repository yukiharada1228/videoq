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

const SECRET = "test-jwt-secret-apikeys";
const ENV = {
  ENVIRONMENT: "development",
  AUTH_JWT_SECRET: SECRET,
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
} as unknown as Record<string, unknown>;

async function accessToken(userId = 5) {
  return signAccessToken(SECRET, userId);
}

async function postCreate(body: string, token?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["authorization"] = `Bearer ${token}`;
  return authRoutes.request("/api-keys", { method: "POST", headers, body }, ENV);
}

describe("api-keys management", () => {
  it("GET /api-keys 認証なし → 401", async () => {
    const res = await authRoutes.request("/api-keys", { method: "GET" }, ENV);
    expect(res.status).toBe(401);
  });

  it("POST 認証なし → 401", async () => {
    const res = await postCreate(JSON.stringify({ name: "k" }));
    expect(res.status).toBe(401);
  });

  it("POST name 欠落 → 400 required（DB 到達前）", async () => {
    const res = await postCreate(JSON.stringify({}), await accessToken());
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.details.name).toEqual(["Invalid input: expected string, received undefined"]);
  });

  it("POST name 空白のみ → 400 blank", async () => {
    const res = await postCreate(JSON.stringify({ name: "   " }), await accessToken());
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.details.name).toEqual(["Too small: expected string to have >=1 characters"]);
  });

  it("POST access_level 不正 → 400 invalid choice", async () => {
    const res = await postCreate(
      JSON.stringify({ name: "k", access_level: "admin" }),
      await accessToken(),
    );
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error.details.access_level).toEqual(['Invalid option: expected one of "all"|"read_only"']);
  });
});
