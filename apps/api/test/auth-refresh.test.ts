import { describe, it, expect, beforeEach, vi } from "vitest";
import { jwtVerify } from "jose";
import { authRoutes } from "../src/features/auth/routes";
import { matchableSql, normalizePgQuery, type MatchableSql, type QueryCall } from "./helpers/pg-fake";

const SECRET = "test-jwt-secret-xyz";
const ENV = {
  ENVIRONMENT: "development",
  AUTH_JWT_SECRET: SECRET,
  CORS_ALLOW_ORIGIN: "http://localhost:3000",
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
} as unknown as Record<string, unknown>;

const calls: QueryCall[] = [];
let rowsFor: (sql: MatchableSql) => Record<string, unknown>[];

vi.mock("pg", () => {
  class FakeClient {
    async connect() {}
    async end() {}
    async query(sqlOrConfig: unknown, args: unknown[] = []) {
      const query = normalizePgQuery(sqlOrConfig as never, args);
      const sql = matchableSql(query.sql);
      calls.push({ sql, args: query.args });
      return { rows: rowsFor(sql), rowCount: rowsFor(sql).length };
    }
  }
  return { default: { Client: FakeClient } };
});

function postTokens(cookie?: string) {
  const headers: Record<string, string> = {
    Origin: "http://localhost:3000",
  };
  if (cookie) headers["cookie"] = cookie;
  return authRoutes.request("/tokens", { method: "POST", headers }, ENV);
}

beforeEach(() => {
  calls.length = 0;
  rowsFor = () => [];
});

describe("POST /tokens refresh", () => {
  it("Origin欠落は403", async () => {
    const res = await authRoutes.request(
      "/tokens",
      { method: "POST" },
      ENV,
    );
    expect(res.status).toBe(403);
  });

  it("vq_refresh cookie 欠落 → 401 AUTHENTICATION_FAILED", async () => {
    const res = await postTokens();
    expect(res.status).toBe(401);
    const j = await res.json();
    expect(j.error.code).toBe("AUTHENTICATION_FAILED");
    expect(j.error.message).toBe("Invalid refresh token");
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie.toLowerCase()).toMatch(/vq_refresh=.*max-age=0|vq_refresh=;/);
  });

  it("旧 refresh_token cookie は廃止", async () => {
    const res = await postTokens("refresh_token=legacy-token");
    expect(res.status).toBe(401);
  });

  it("未知の opaque refresh token → 401", async () => {
    const res = await postTokens("vq_refresh=unknown-opaque-token");
    expect(res.status).toBe(401);
    expect(calls.some((call) => call.sql.includes("FROM auth_sessions"))).toBe(true);
  });

  it("有効な opaque refresh → Bearer access token + refresh rotation", async () => {
    rowsFor = (sql) =>
      sql.includes("FROM auth_sessions")
        ? [{
            id: "old-session",
            user_id: 5,
            family_id: "family-1",
            revoked_at: null,
            expires_at: new Date(Date.now() + 60_000),
            is_active: true,
          }]
        : [];
    const res = await postTokens("vq_refresh=valid-opaque-token");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      token_type: "Bearer",
      expires_in: 600,
    });
    expect(typeof body.access_token).toBe("string");
    const { payload, protectedHeader } = await jwtVerify(
      body.access_token,
      new TextEncoder().encode(SECRET),
      { algorithms: ["HS256"], issuer: "videoq", audience: "videoq-api" },
    );
    expect(protectedHeader.alg).toBe("HS256");
    expect(payload.sub).toBe("5");
    expect(payload.sid).toEqual(expect.any(String));
    expect(payload.iat).toEqual(expect.any(Number));
    expect(payload.exp).toBe(payload.iat! + 600);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("vq_refresh=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).not.toContain("access_token=");
    expect(calls.some((call) => call.sql.includes("INSERT INTO auth_sessions"))).toBe(true);
    expect(calls.some((call) => call.sql.includes("replaced_by"))).toBe(true);
  });

  it("使用済みrefresh tokenの再利用はsession family全体を失効する", async () => {
    rowsFor = (sql) =>
      sql.includes("FROM auth_sessions")
        ? [
            {
              id: "used-session",
              user_id: 5,
              family_id: "family-1",
              revoked_at: new Date(),
              expires_at: new Date(Date.now() + 60_000),
              is_active: true,
            },
          ]
        : [];
    const res = await postTokens("vq_refresh=reused-opaque-token");
    expect(res.status).toBe(401);
    expect(
      calls.some(
        (call) =>
          call.sql.includes("UPDATE auth_sessions") &&
          call.sql.includes("family_id"),
      ),
    ).toBe(true);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie.toLowerCase()).toContain("vq_refresh=");
  });
});
