import { describe, it, expect, beforeEach, vi } from "vitest";
import { SignJWT } from "jose";
import { oauthRoutes } from "../src/routes/oauth";

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
  JWT_SECRET: SECRET,
  LEGACY_API_ORIGIN: "https://legacy.test",
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
} as unknown as Record<string, unknown>;

beforeEach(() => {
  calls.length = 0;
  rowsFor = () => [];
  rowCountFor = () => undefined;
});

async function accessToken(userId = 7) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ token_type: "access", user_id: userId, jti: "j" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(new TextEncoder().encode(SECRET));
}

describe("GET /api/oauth/tokens/", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await oauthRoutes.request("/api/oauth/tokens/", { method: "GET" }, ENV);
    expect(res.status).toBe(401);
  });

  it("lists non-expired tokens for the user", async () => {
    rowsFor = (sql) => {
      if (sql.includes("oauth2_provider_accesstoken")) {
        return [
          {
            id: 11,
            scope: "mcp",
            client_id: "claude",
            client_name: "Claude",
            issued_at: "2026-08-01T12:00:00+00:00",
            expires_at: "2026-09-01T12:00:00+00:00",
          },
        ];
      }
      return [];
    };
    const res = await oauthRoutes.request(
      "/api/oauth/tokens/",
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
          issued_at: "2026-08-01T12:00:00+00:00",
          expires_at: "2026-09-01T12:00:00+00:00",
        },
      ],
    });
    const list = calls.find((c) => c.sql.includes("oauth2_provider_accesstoken"));
    expect(list?.args).toEqual([7]);
  });
});

describe("DELETE /api/oauth/tokens/:id/", () => {
  it("returns 204 when the owner revokes a token", async () => {
    rowsFor = (sql) =>
      sql.includes("oauth2_provider_accesstoken") && sql.includes("delete")
        ? [{ id: 11 }]
        : [];
    const res = await oauthRoutes.request(
      "/api/oauth/tokens/11/",
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${await accessToken()}` },
      },
      ENV,
    );
    expect(res.status).toBe(204);
    const del = calls.find((c) =>
      c.sql.includes("oauth2_provider_accesstoken") && c.sql.includes("delete"),
    );
    expect(del?.args).toEqual([11, 7]);
  });

  it("returns 404 when token is missing", async () => {
    rowsFor = () => [];
    const res = await oauthRoutes.request(
      "/api/oauth/tokens/999/",
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${await accessToken()}` },
      },
      ENV,
    );
    expect(res.status).toBe(404);
  });
});
