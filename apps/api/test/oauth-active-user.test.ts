import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import { requireAuth, oauthBearerMethod } from "../src/middleware/auth";
import {
  executeFakePgQuery,
  type MatchableSql,
  type PgQueryInput,
  type QueryCall,
} from "./helpers/pg-fake";
import { sha256Hex } from "../src/shared/crypto";

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
      });
    }
  }
  return { default: { Client: FakeClient } };
});

const ENV = {
  ENVIRONMENT: "development",
  AUTH_JWT_SECRET: "unused",
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
} as unknown as Record<string, unknown>;

const app = new Hono();
app.get("/probe", requireAuth(oauthBearerMethod), (c) => c.json({ ok: true }));

beforeEach(() => {
  calls.length = 0;
  rowsFor = () => [];
});

describe("OAuth bearer requires active user", () => {
  it("is_active を JOIN した解決に失敗すると 401", async () => {
    const raw = "oauth-inactive-user-token";
    const checksum = await sha256Hex(raw);
    // 行を返さない = inactive / missing
    rowsFor = (sql, args) => {
      if (sql.includes("oauth_access_tokens") && args[0] === checksum) return [];
      return [];
    };
    const res = await app.request(
      "/probe",
      { headers: { Authorization: `Bearer ${raw}` } },
      ENV,
    );
    expect(res.status).toBe(401);
    expect(
      calls.some(
        (c) =>
          c.sql.includes("oauth_access_tokens") &&
          c.sql.includes("is_active"),
      ),
    ).toBe(true);
  });

  it("active user なら 200", async () => {
    const raw = "oauth-active-user-token";
    const checksum = await sha256Hex(raw);
    rowsFor = (sql, args) => {
      if (sql.includes("oauth_access_tokens") && args.includes(checksum)) {
        return [{ user_id: 4, scope: "mcp" }];
      }
      return [];
    };
    const res = await app.request(
      "/probe",
      { headers: { Authorization: `Bearer ${raw}` } },
      ENV,
    );
    expect(res.status).toBe(200);
  });
});
