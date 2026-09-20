import { beforeEach, describe, expect, it, vi } from "vitest";

const userRow = vi.hoisted(() => ({ value: [] as unknown[] }));
const verifyApiKey = vi.hoisted(() => vi.fn());
const getSession = vi.hoisted(() => vi.fn());

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
  createAuth: () => ({ api: { getSession, verifyApiKey } }),
  authBaseURL: () => "http://localhost",
  oauthResourceAudience: () => "http://localhost/api/mcp",
}));

import { Hono } from "hono";
import {
  apiKeyMethod,
  requireAuth,
  requireScope,
  sessionMethod,
} from "../src/middleware/auth";
import type { AppEnv } from "../src/types/bindings";
import { TEST_USER_ID } from "./helpers/auth";

// テスト用ヘッダの近道を使わず、本物の API key 検証経路を通す。
const ENV = { ENVIRONMENT: "production" } as unknown as AppEnv["Bindings"];

function app() {
  const a = new Hono<AppEnv>();
  a.get("/who", requireAuth(apiKeyMethod), (c) => c.json({ userId: c.var.userId }));
  a.all("/scoped", requireAuth(apiKeyMethod), requireScope(), (c) => c.json({ allowed: true }));
  a.get("/session", requireAuth(sessionMethod), (c) =>
    c.json({ userId: c.var.userId, authVia: c.var.authVia }),
  );
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
  getSession.mockResolvedValue(null);
});

describe("Better Auth session と停止アカウント", () => {
  const sessionRequest = () => app().request("https://videoq.jp/session", {}, ENV);

  it("Cookieキャッシュを使わず、失効状態をDBから確認する", async () => {
    getSession.mockResolvedValue({
      user: { id: TEST_USER_ID, banned: false, isActive: true },
    });

    const res = await sessionRequest();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: TEST_USER_ID, authVia: "session" });
    expect(getSession).toHaveBeenCalledWith(expect.objectContaining({
      query: { disableCookieCache: true },
    }));
  });

  it("キャッシュ済みセッションでもbannedユーザーを拒否する", async () => {
    getSession.mockResolvedValue({
      user: { id: TEST_USER_ID, banned: true, isActive: true },
    });

    expect((await sessionRequest()).status).toBe(401);
  });

  it("キャッシュ済みセッションでもis_active=falseを拒否する", async () => {
    getSession.mockResolvedValue({
      user: { id: TEST_USER_ID, banned: false, isActive: false },
    });

    expect((await sessionRequest()).status).toBe(401);
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

describe("検証済み API キーの権限メタデータ", () => {
  it.each([
    [{ accessLevel: "all" }, 200, 200],
    [{ accessLevel: "read_only" }, 200, 403],
    [{ access_level: "all" }, 200, 200],
    [JSON.stringify({ access_level: "all" }), 200, 200],
    [{ accessLevel: "read_only", access_level: "all" }, 200, 403],
    [{ accessLevel: "", access_level: "all" }, 403, 403],
    [{ accessLevel: "unknown" }, 403, 403],
    [null, 200, 403],
    ["invalid-json", 200, 403],
  ])("metadata=%j の読み取り=%i、書き込み=%i", async (metadata, readStatus, writeStatus) => {
    userRow.value = [{ banned: false, isActive: true }];
    verifyApiKey.mockResolvedValue({ valid: true, key: { referenceId: TEST_USER_ID, metadata } });

    for (const [method, status] of [["GET", readStatus], ["POST", writeStatus]] as const) {
      const response = await app().request("https://videoq.jp/scoped", {
        method, headers: { "X-API-Key": "vq_abcdefghijklmnop" },
      }, ENV);
      expect(response.status).toBe(status);
    }
  });
});
