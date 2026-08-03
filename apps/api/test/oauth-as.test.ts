import { describe, it, expect, beforeEach, vi } from "vitest";
import { createApp } from "../src/app";
import { pkceS256Challenge, generateOpaqueToken } from "../src/lib/oauth";
import { sha256Hex } from "../src/shared/crypto";

import {
  executeFakePgQuery,
  type PgQueryInput,
  type QueryCall,
  type MatchableSql,
} from "./helpers/pg-fake";

const calls: QueryCall[] = [];
let rowsFor: (sql: MatchableSql, args: unknown[]) => Record<string, unknown>[];
let rowCountFor: (sql: MatchableSql) => number | undefined;
let returningId = 1;

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

const SECRET = "test-jwt-secret-oauth-as";
const ENV = {
  ENVIRONMENT: "development",
  AUTH_JWT_SECRET: SECRET,
  CORS_ALLOW_ORIGIN: "http://localhost:3000",
  FRONTEND_URL: "http://localhost:3000",
  OAUTH_ISSUER_URL: "http://testserver",
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
} as unknown as Record<string, unknown>;

beforeEach(() => {
  calls.length = 0;
  returningId = 1;
  rowsFor = () => [];
  rowCountFor = () => undefined;
});

async function pkcePair() {
  const verifier = generateOpaqueToken(64);
  const challenge = await pkceS256Challenge(verifier);
  return { verifier, challenge };
}

function appRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    client_id: "client-abc",
    client_secret: "",
    client_type: "public",
    authorization_grant_type: "authorization-code",
    name: "Claude Desktop",
    redirect_uris: "http://127.0.0.1:33418/callback",
    post_logout_redirect_uris: "",
    algorithm: "",
    skip_authorization: false,
    user_id: null,
    registration_source: "dcr",
    hash_client_secret: true,
    ...overrides,
  };
}

describe("well-known metadata", () => {
  const app = createApp();

  it("serves authorization server metadata", async () => {
    const res = await app.request(
      "/.well-known/oauth-authorization-server",
      {},
      ENV,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const body = await res.json();
    expect(body.issuer).toBe("http://testserver");
    expect(body.authorization_endpoint).toBe(
      "http://testserver/api/oauth/authorize",
    );
    expect(body.token_endpoint).toBe("http://testserver/api/oauth/token");
    expect(body.registration_endpoint).toBe(
      "http://testserver/api/oauth/register",
    );
    expect(body.code_challenge_methods_supported).toContain("S256");
    expect(body.grant_types_supported).toContain("authorization_code");
    expect(body.scopes_supported).toContain("read");
  });

  it("serves protected resource metadata at bare and path forms", async () => {
    for (const path of [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/api/mcp",
    ]) {
      const res = await app.request(path, {}, ENV);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.resource).toBe("http://testserver/api/mcp");
      expect(body.authorization_servers).toContain("http://testserver");
    }
  });
});

describe("DCR POST /api/oauth/register/", () => {
  const app = createApp();

  it("registers a public client with PKCE auth method none", async () => {
    rowsFor = (sql) => {
      if (sql.includes("INSERT INTO oauth_applications")) {
        return [appRow({ client_id: "generated-id", client_type: "public" })];
      }
      return [];
    };
    const res = await app.request(
      "/api/oauth/register",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["http://127.0.0.1:33418/callback"],
          client_name: "Claude Desktop",
          token_endpoint_auth_method: "none",
        }),
      },
      ENV,
    );
    expect(res.status).toBe(201);
    const payload = await res.json();
    expect(payload.client_id).toBeTruthy();
    expect(payload.client_secret).toBeUndefined();
    expect(payload.token_endpoint_auth_method).toBe("none");
    expect(payload.registration_access_token).toBeTruthy();
    expect(payload.registration_client_uri).toBe(
      `http://testserver/api/oauth/register/${payload.client_id}`,
    );
    expect(
      calls.some((c) => c.sql.includes("INSERT INTO oauth_applications")),
    ).toBe(true);
    expect(
      calls.some((c) => c.sql.includes("INSERT INTO oauth_access_tokens")),
    ).toBe(true);
  });

  it("returns plaintext client_secret for confidential clients", async () => {
    rowsFor = (sql) => {
      if (sql.includes("INSERT INTO oauth_applications")) {
        return [
          appRow({
            client_id: "conf-id",
            client_type: "confidential",
            client_secret:
              "vqpw$1$600000$AQEBAQEBAQEBAQEBAQEBAQ$9HOK2mUkCczobmRKp8Y3rLltV4H_6yirxSgk-ChO8gQ",
          }),
        ];
      }
      return [];
    };
    const res = await app.request(
      "/api/oauth/register",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
          client_name: "Confidential client",
          token_endpoint_auth_method: "client_secret_basic",
        }),
      },
      ENV,
    );
    expect(res.status).toBe(201);
    const payload = await res.json();
    expect(payload.client_secret).toBeTruthy();
    expect(String(payload.client_secret).startsWith("pbkdf2_")).toBe(false);
  });

  it("rejects unsupported redirect scheme", async () => {
    const res = await app.request(
      "/api/oauth/register",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["ftp://example.com/callback"],
          client_name: "Bad",
        }),
      },
      ENV,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_client_metadata" });
  });

  it("rejects missing redirect_uris", async () => {
    const res = await app.request(
      "/api/oauth/register",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_name: "no-redirect" }),
      },
      ENV,
    );
    expect(res.status).toBe(400);
  });

  it("rejects unsupported grant type", async () => {
    const res = await app.request(
      "/api/oauth/register",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["http://127.0.0.1/cb"],
          grant_types: ["urn:example:unsupported"],
        }),
      },
      ENV,
    );
    expect(res.status).toBe(400);
  });
});

describe("authorize + token PKCE flow", () => {
  const app = createApp();

  it("redirects unauthenticated authorize to SPA login", async () => {
    rowsFor = (sql) =>
      sql.includes("oauth_applications") ? [appRow()] : [];
    const { challenge } = await pkcePair();
    const url =
      "/api/oauth/authorize?response_type=code&client_id=client-abc" +
      "&redirect_uri=" +
      encodeURIComponent("http://127.0.0.1:33418/callback") +
      "&code_challenge=" +
      challenge +
      "&code_challenge_method=S256&scope=read";
    const res = await app.request(url, {}, ENV);
    expect(res.status).toBe(302);
    const loc = res.headers.get("Location")!;
    expect(loc.startsWith("http://localhost:3000/login?next=")).toBe(true);
    // Trailing slash is stripped by app middleware before authorize sees the path.
    expect(loc).toContain(encodeURIComponent("/api/oauth/authorize"));
  });

  it("renders consent HTML for authenticated refresh session", async () => {
    rowsFor = (sql) => {
      if (sql.includes("FROM auth_sessions")) return [{ user_id: 7, id: "session-1" }];
      return sql.includes("oauth_applications") ? [appRow()] : [];
    };
    const { challenge } = await pkcePair();
    const url =
      "/api/oauth/authorize?response_type=code&client_id=client-abc" +
      "&redirect_uri=" +
      encodeURIComponent("http://127.0.0.1:33418/callback") +
      "&code_challenge=" +
      challenge +
      "&code_challenge_method=S256&scope=read";
    const res = await app.request(
      url,
      { headers: { Cookie: "vq_refresh=opaque-session-token" } },
      ENV,
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Authorize Claude Desktop?");
    expect(html).toContain("127.0.0.1");
    expect(html).toContain("Dynamic Client Registration");
  });

  it("issues code on consent POST and exchanges with PKCE", async () => {
    const { verifier, challenge } = await pkcePair();
    let grantDeleted = false;

    rowsFor = (sql, args) => {
      if (sql.includes("FROM auth_sessions")) {
        return [{ user_id: 7, id: "session-1" }];
      }
      if (sql.includes("UPDATE auth_action_tokens") && sql.includes("RETURNING")) {
        return [{ user_id: 7, payload: {} }];
      }
      if (sql.includes("oauth_applications")) {
        return [appRow()];
      }
      if (sql.includes("INSERT INTO oauth_grants")) {
        return [];
      }
      if (sql.includes("oauth_grants")) {
        if (grantDeleted) return [];
        return [
          {
            id: 9,
            user_id: 7,
            code: args[0],
            application_id: 1,
            expires: new Date(Date.now() + 60_000).toISOString(),
            redirect_uri: "http://127.0.0.1:33418/callback",
            scope: "read",
            code_challenge: challenge,
            code_challenge_method: "S256",
            resource: ["http://testserver/api/mcp"],
          },
        ];
      }
      if (sql.includes("INSERT INTO oauth_access_tokens")) {
        returningId += 1;
        return [{ id: returningId }];
      }
      if (sql.includes("DELETE oauth_grants")) {
        grantDeleted = true;
        return [];
      }
      return [];
    };

    const form = new URLSearchParams({
      action_token: "oauth-form-token",
      allow: "True",
      client_id: "client-abc",
      redirect_uri: "http://127.0.0.1:33418/callback",
      response_type: "code",
      scope: "read",
      state: "xyz",
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource: "http://testserver/api/mcp",
      nonce: "",
    });

    const authRes = await app.request(
      "/api/oauth/authorize",
      {
        method: "POST",
        headers: {
          Cookie: "vq_refresh=opaque-session-token",
          Origin: "http://localhost:3000",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
        redirect: "manual",
      },
      ENV,
    );
    expect(authRes.status).toBe(302);
    const loc = new URL(authRes.headers.get("Location")!);
    expect(loc.origin + loc.pathname).toBe("http://127.0.0.1:33418/callback");
    const code = loc.searchParams.get("code");
    expect(code).toBeTruthy();
    expect(loc.searchParams.get("state")).toBe("xyz");

    const tokenRes = await app.request(
      "/api/oauth/token",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code!,
          redirect_uri: "http://127.0.0.1:33418/callback",
          client_id: "client-abc",
          code_verifier: verifier,
        }).toString(),
      },
      ENV,
    );
    expect(tokenRes.status).toBe(200);
    const tokenBody = await tokenRes.json();
    expect(tokenBody.access_token).toBeTruthy();
    expect(tokenBody.refresh_token).toBeTruthy();
    expect(tokenBody.token_type).toBe("Bearer");
    expect(tokenBody.expires_in).toBe(3600);
    expect(tokenBody.scope).toBe("read");
  });

  it("rejects wrong PKCE verifier", async () => {
    const { challenge } = await pkcePair();
    const badVerifier = generateOpaqueToken(64);
    rowsFor = (sql) => {
      if (sql.includes("oauth_applications")) return [appRow()];
      if (sql.includes("oauth_grants")) {
        return [
          {
            id: 9,
            user_id: 7,
            code: "the-code",
            application_id: 1,
            expires: new Date(Date.now() + 60_000).toISOString(),
            redirect_uri: "http://127.0.0.1:33418/callback",
            scope: "read",
            code_challenge: challenge,
            code_challenge_method: "S256",
            resource: [],
          },
        ];
      }
      return [];
    };
    const res = await app.request(
      "/api/oauth/token",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: "the-code",
          redirect_uri: "http://127.0.0.1:33418/callback",
          client_id: "client-abc",
          code_verifier: badVerifier,
        }).toString(),
      },
      ENV,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_grant" });
  });
});

describe("refresh + revoke", () => {
  const app = createApp();

  it("rotates refresh tokens", async () => {
    rowsFor = (sql) => {
      if (sql.includes("oauth_applications")) return [appRow()];
      if (
        sql.includes("oauth_refresh_tokens") &&
        sql.includes("revoked IS NULL")
      ) {
        return [
          {
            id: 3,
            user_id: 7,
            application_id: 1,
            access_token_id: 10,
            token_family: "11111111-1111-1111-1111-111111111111",
            resource: [],
            created: new Date().toISOString(),
            scope: "read",
          },
        ];
      }
      if (sql.includes("INSERT INTO oauth_access_tokens")) {
        return [{ id: 11 }];
      }
      return [];
    };
    const res = await app.request(
      "/api/oauth/token",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: "old-refresh-value",
          client_id: "client-abc",
        }).toString(),
      },
      ENV,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.access_token).toBeTruthy();
    expect(body.refresh_token).toBeTruthy();
    expect(
      calls.some((c) =>
        c.sql.includes("SET revoked = now()") ||
        c.sql.includes("revoked = now()"),
      ),
    ).toBe(true);
  });

  it("revokes via revoke_token endpoint", async () => {
    rowsFor = (sql) =>
      sql.includes("oauth_applications") ? [appRow()] : [];
    const opaque = "access-to-revoke";
    const res = await app.request(
      "/api/oauth/revoke_token",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: opaque,
          client_id: "client-abc",
          token_type_hint: "access_token",
        }).toString(),
      },
      ENV,
    );
    expect(res.status).toBe(200);
    const checksum = await sha256Hex(opaque);
    const del = calls.find((c) =>
      c.sql.includes("DELETE FROM oauth_access_tokens"),
    );
    expect(del?.args[0]).toBe(checksum);
  });
});
