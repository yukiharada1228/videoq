import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  oauthRoutes,
  oauthWellKnownRoutes,
} from "../src/features/oauth/routes";
import { DCR_REGISTRATION_SCOPE } from "../src/lib/oauth";

import { executeFakePgQuery, type MatchableSql, type PgQueryInput } from "./helpers/pg-fake";

let rowsFor: (sql: MatchableSql, args: unknown[]) => Record<string, unknown>[];

vi.mock("pg", () => {
  class FakeClient {
    async connect() {}
    async end() {}
    async query(sqlOrConfig: unknown, args: unknown[] = []) {
      return executeFakePgQuery({
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
  AUTH_JWT_SECRET: "s",
  OAUTH_ISSUER_URL: "http://testserver",
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
} as unknown as Record<string, unknown>;

// resolveRegistrationAccessToken の JOIN 行（有効な登録トークン）
const regRow = {
  token: "old-reg-token",
  scope: DCR_REGISTRATION_SCOPE,
  expires: new Date(Date.now() + 3600_000).toISOString(),
  application_id: 5,
  id: 5,
  client_id: "client-abc",
  client_secret: "",
  client_type: "public",
  authorization_grant_type: "authorization-code",
  name: "Claude",
  redirect_uris: "https://c/cb",
  skip_authorization: false,
  user_id: null,
  registration_source: "dcr",
  hash_client_secret: true,
};

beforeEach(() => {
  rowsFor = () => [];
});

describe("OAuth metadata prefix alias", () => {
  it("/.well-known/oauth-authorization-server も 200（root と同一内容）", async () => {
    const res = await oauthWellKnownRoutes.request(
      "/.well-known/oauth-authorization-server",
      {},
      ENV,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.issuer).toBe("http://testserver");
    expect(body.token_endpoint).toBe("http://testserver/api/oauth/token");
  });
});

describe("DCR management (RFC 7592)", () => {
  it("DELETE 認証なし → 401 invalid_token", async () => {
    const res = await oauthRoutes.request(
      "/register/client-abc",
      { method: "DELETE" },
      ENV,
    );
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid_token");
  });

  it("DELETE 有効トークン → 204", async () => {
    rowsFor = (sql) => (/JOIN oauth_applications/.test(sql) ? [regRow] : []);
    const res = await oauthRoutes.request(
      "/register/client-abc",
      { method: "DELETE", headers: { Authorization: "Bearer old-reg-token" } },
      ENV,
    );
    expect(res.status).toBe(204);
  });

  it("PUT 有効トークン + メタデータ → 200 + 新しい registration_access_token", async () => {
    rowsFor = (sql) => (/JOIN oauth_applications/.test(sql) ? [regRow] : []);
    const res = await oauthRoutes.request(
      "/register/client-abc",
      {
        method: "PUT",
        headers: { Authorization: "Bearer old-reg-token", "content-type": "application/json" },
        body: JSON.stringify({ redirect_uris: ["https://c/cb2"], client_name: "Claude 2" }),
      },
      ENV,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.client_id).toBe("client-abc");
    expect(body.redirect_uris).toEqual(["https://c/cb2"]);
    expect(body.client_name).toBe("Claude 2");
    expect(typeof body.registration_access_token).toBe("string");
    expect(body.registration_access_token).not.toBe("old-reg-token"); // rotation
  });

  it("PUT 不正メタデータ（redirect_uris 非配列）→ 400", async () => {
    rowsFor = (sql) => (/JOIN oauth_applications/.test(sql) ? [regRow] : []);
    const res = await oauthRoutes.request(
      "/register/client-abc",
      {
        method: "PUT",
        headers: { Authorization: "Bearer old-reg-token", "content-type": "application/json" },
        body: JSON.stringify({ redirect_uris: "notarray" }),
      },
      ENV,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatchObject({
      code: "VALIDATION_ERROR",
      details: { redirect_uris: ["Invalid input: expected array, received string"] },
    });
  });
});
