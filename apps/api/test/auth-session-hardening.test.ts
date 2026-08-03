import { describe, it, expect, beforeEach, vi } from "vitest";
import { authRoutes } from "../src/features/auth/routes";
import { signAccessToken } from "./helpers/auth";
import {
  executeFakePgQuery,
  type MatchableSql,
  type PgQueryInput,
  type QueryCall,
} from "./helpers/pg-fake";

const calls: QueryCall[] = [];
let rowsFor: (sql: MatchableSql, args: unknown[]) => Record<string, unknown>[];

vi.mock("pg", () => {
  class FakeClient {
    async connect() {}
    async end() {}
    async query(sqlOrConfig: unknown, args: unknown[] = []) {
      return executeFakePgQuery({
        calls,
        sqlOrConfig: sqlOrConfig as PgQueryInput,
        args,
        rowsFor,
        defaultActiveTestSession: false,
      });
    }
  }
  return { default: { Client: FakeClient } };
});

const SECRET = "test-session-hardening";
const ENV = {
  ENVIRONMENT: "development",
  AUTH_JWT_SECRET: SECRET,
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
} as unknown as Record<string, unknown>;

beforeEach(() => {
  calls.length = 0;
  rowsFor = () => [];
});

describe("JWT sid session binding", () => {
  it("失効済み sid の access JWT は 401", async () => {
    const token = await signAccessToken(SECRET, 5, "videoq", "revoked-session");
    const res = await authRoutes.request("/me", {
      headers: { authorization: `Bearer ${token}` },
    }, ENV);
    expect(res.status).toBe(401);
    expect(
      calls.some(
        (c) =>
          c.sql.includes("FROM auth_sessions") &&
          c.sql.includes("s.id = $1") &&
          c.args[0] === "revoked-session",
      ),
    ).toBe(true);
  });

  it("有効な sid なら認証を通過する", async () => {
    rowsFor = (sql, args) => {
      if (
        sql.includes("FROM auth_sessions") &&
        sql.includes("s.id = $1") &&
        args[0] === "live-session"
      ) {
        return [{ ok: 1 }];
      }
      return [];
    };
    const token = await signAccessToken(SECRET, 5, "videoq", "live-session");
    // 認証後のバリデーションまで到達すれば sid チェックは成功している。
    const res = await authRoutes.request("/me/email", {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: "not-an-email" }),
    }, ENV);
    expect(res.status).toBe(400);
  });
});

describe("credential change revokes sessions and OAuth", () => {
  it("password reset 成功後にセッションと OAuth を revoke する", async () => {
    rowsFor = (sql) => {
      if (sql.includes("UPDATE auth_action_tokens") && sql.includes("RETURNING")) {
        return [{ user_id: 9, payload: {} }];
      }
      if (sql.includes("UPDATE users") && sql.includes("password")) {
        return [{ id: 9 }];
      }
      return [];
    };
    const res = await authRoutes.request("/password-resets/opaque-token", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ new_password: "CorrectHorseBattery1!" }),
    }, ENV);
    expect(res.status).toBe(200);
    expect(
      calls.some(
        (c) =>
          c.sql.includes("UPDATE auth_sessions") &&
          c.sql.includes("user_id = $1") &&
          c.args[0] === 9,
      ),
    ).toBe(true);
    expect(
      calls.some(
        (c) =>
          c.sql.includes("delete") &&
          c.sql.includes("oauth_access_tokens") &&
          c.args.includes(9),
      ),
    ).toBe(true);
    expect(
      calls.some(
        (c) =>
          c.sql.includes("delete") &&
          c.sql.includes("oauth_refresh_tokens") &&
          c.args.includes(9),
      ),
    ).toBe(true);
  });

  it("email change 成功後にセッションと OAuth を revoke する", async () => {
    rowsFor = (sql) => {
      if (sql.includes("UPDATE auth_action_tokens") && sql.includes("RETURNING")) {
        return [{ user_id: 11, payload: { email: "new@example.com" } }];
      }
      if (sql.includes("pending_email") || sql.includes("UPDATE users")) {
        return [{ id: 11 }];
      }
      return [];
    };
    const res = await authRoutes.request("/email-change/opaque-token", {
      method: "PATCH",
    }, ENV);
    expect(res.status).toBe(200);
    expect(
      calls.some(
        (c) =>
          c.sql.includes("UPDATE auth_sessions") &&
          c.sql.includes("user_id = $1") &&
          c.args[0] === 11,
      ),
    ).toBe(true);
    expect(
      calls.some(
        (c) =>
          c.sql.includes("delete") &&
          c.sql.includes("oauth_access_tokens") &&
          c.args.includes(11),
      ),
    ).toBe(true);
  });
});
