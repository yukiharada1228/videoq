import { describe, it, expect, beforeEach, vi } from "vitest";
import { oauthRoutes } from "../src/features/oauth/routes";
import { signAccessToken } from "./helpers/auth";

import {
  executeFakePgQuery,
  type PgQueryInput,
  type QueryCall,
  type MatchableSql,
} from "./helpers/pg-fake";

const calls: QueryCall[] = [];
let rowsFor: (sql: MatchableSql, args: unknown[]) => Record<string, unknown>[];
let rowCountFor: (sql: MatchableSql) => number | undefined;

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
        rowCountFor: (sql, a, rows) => rowCountFor(sql) ?? rows.length,
      });
    }
  }
  return { default: { Client: FakeClient } };
});

const SECRET = "test-jwt-secret-oauth-tokens";
const ENV = {
  ENVIRONMENT: "development",
  AUTH_JWT_SECRET: SECRET,
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
} as unknown as Record<string, unknown>;

beforeEach(() => {
  calls.length = 0;
  rowsFor = () => [];
  rowCountFor = () => undefined;
});

async function accessToken(userId = 7) {
  return signAccessToken(SECRET, userId);
}

describe("GET /tokens/", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await oauthRoutes.request("/tokens", { method: "GET" }, ENV);
    expect(res.status).toBe(401);
  });

  it("lists non-expired tokens for the user", async () => {
    rowsFor = (sql) => {
      if (sql.includes("oauth_access_tokens")) {
        return [
          {
            id: 11,
            scope: "mcp",
            client_id: "claude",
            client_name: "Claude",
            issued_at: "2026-08-01T12:00:00.000Z",
            expires_at: "2026-09-01T12:00:00.000Z",
          },
        ];
      }
      return [];
    };
    const res = await oauthRoutes.request(
      "/tokens",
      {
        method: "GET",
        headers: { Authorization: `Bearer ${await accessToken()}` },
      },
      ENV,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      tokens: [
        {
          id: 11,
          client_id: "claude",
          client_name: "Claude",
          scope: "mcp",
          issued_at: "2026-08-01T12:00:00.000Z",
          expires_at: "2026-09-01T12:00:00.000Z",
        },
      ],
    });
    const list = calls.find((c) => c.sql.includes("oauth_access_tokens"));
    expect(list?.args).toEqual([7]);
  });
});

describe("DELETE /tokens/:id/", () => {
  it("returns 204 and revokes refresh tokens for the same app", async () => {
    rowsFor = (sql) => {
      if (
        sql.includes("oauth_access_tokens") &&
        sql.includes("select") &&
        !sql.includes("delete")
      ) {
        return [{ id: 11, application_id: 3 }];
      }
      return [];
    };
    const res = await oauthRoutes.request(
      "/tokens/11",
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${await accessToken()}` },
      },
      ENV,
    );
    expect(res.status).toBe(204);
    expect(
      calls.some(
        (c) =>
          c.sql.includes("oauth_refresh_tokens") && c.sql.includes("delete"),
      ),
    ).toBe(true);
    expect(
      calls.some(
        (c) =>
          c.sql.includes("oauth_access_tokens") && c.sql.includes("delete"),
      ),
    ).toBe(true);
  });

  it("returns 404 when token is missing", async () => {
    rowsFor = () => [];
    const res = await oauthRoutes.request(
      "/tokens/999",
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${await accessToken()}` },
      },
      ENV,
    );
    expect(res.status).toBe(404);
  });
});
