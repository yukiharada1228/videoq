import { beforeEach, describe, expect, it, vi } from "vitest";

const userRow = vi.hoisted(() => ({ value: [] as unknown[] }));
const verifyApiKey = vi.hoisted(() => vi.fn());

// users テーブルの参照だけを差し替えた最小の Drizzle スタブ。
const fakeDb = {
  select: () => ({
    from: () => ({ where: () => ({ limit: async () => userRow.value }) }),
  }),
};

vi.mock("../src/db/pool", () => ({
  withDb: (_env: unknown, fn: (db: unknown) => unknown) => fn(fakeDb),
  withClient: vi.fn(),
}));
vi.mock("../src/lib/auth", () => ({
  createAuth: () => ({ api: { verifyApiKey } }),
  authBaseURL: () => "http://localhost",
  oauthResourceAudience: () => "http://localhost/api/mcp",
}));

import { Hono } from "hono";
import { apiKeyMethod, requireAuth } from "../src/middleware/auth";
import type { AppEnv } from "../src/types/bindings";
import { TEST_USER_ID } from "./helpers/auth";

// テスト用ヘッダの近道を使わず、本物の API key 検証経路を通す。
const ENV = { ENVIRONMENT: "production" } as unknown as AppEnv["Bindings"];

function app() {
  const a = new Hono<AppEnv>();
  a.get("/who", requireAuth(apiKeyMethod), (c) => c.json({ userId: c.var.userId }));
  return a;
}

function request() {
  return app().request(
    "https://videoq.jp/who",
    { headers: { "X-API-Key": "vq_abcdefghijklmnop" } },
    ENV,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyApiKey.mockResolvedValue({
    valid: true,
    key: { referenceId: TEST_USER_ID, metadata: { accessLevel: "all" } },
  });
});

describe("API key と停止アカウント", () => {
  it("有効なアカウントのキーは通る", async () => {
    userRow.value = [{ banned: false, isActive: true }];

    const res = await request();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: TEST_USER_ID });
  });

  it("banned なユーザーのAPIキーは、キー自体が有効でも拒否する", async () => {
    userRow.value = [{ banned: true, isActive: true }];

    const res = await request();

    expect(res.status).toBe(401);
  });

  it("is_active=false のユーザーも拒否する", async () => {
    userRow.value = [{ banned: false, isActive: false }];

    const res = await request();

    expect(res.status).toBe(401);
  });

  it("ユーザーが消えている場合も拒否する", async () => {
    userRow.value = [];

    const res = await request();

    expect(res.status).toBe(401);
  });
});
