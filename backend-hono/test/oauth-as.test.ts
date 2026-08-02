import { describe, it, expect, beforeEach, vi } from "vitest";
import { SignJWT } from "jose";
import { createApp } from "../src/app";
import { pkceS256Challenge, generateOpaqueToken } from "../src/lib/oauth";
import { issueCsrfToken } from "../src/utils/csrf";
import { sha256Hex } from "../src/utils/crypto";

type QueryCall = { sql: string; args: unknown[] };
const calls: QueryCall[] = [];
let rowsFor: (sql: string, args: unknown[]) => Record<string, unknown>[];
let rowCountFor: (sql: string) => number | undefined;
let returningId = 1;

vi.mock("pg", () => {
  class FakeClient {
    async connect() {}
    async end() {}
    async query(sql: string, args: unknown[] = []) {
      calls.push({ sql, args });
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*$/i.test(sql.trim())) {
        return { rows: [], rowCount: 0 };
      }
      const rows = rowsFor(sql, args);
      const rowCount = rowCountFor(sql) ?? rows.length;
      return { rows, rowCount };
    }
  }
  return { default: { Client: FakeClient } };
});

const SECRET = "test-jwt-secret-oauth-as";
const ENV = {
  ENVIRONMENT: "development",
  JWT_SECRET: SECRET,
  LEGACY_API_ORIGIN: "https://legacy.test",
  CORS_ALLOW_ORIGIN: "http://localhost:3000",
  FRONTEND_URL: "http://localhost:3000",
  OAUTH2_PROVIDER_ISSUER_URL: "http://testserver",
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
} as unknown as Record<string, unknown>;

beforeEach(() => {
  calls.length = 0;
  returningId = 1;
  rowsFor = () => [];
  rowCountFor = () => undefined;
});

async function accessCookie(userId = 7) {
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    token_type: "access",
    user_id: userId,
    jti: "j",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(new TextEncoder().encode(SECRET));
  return `access_token=${token}`;
}

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
      "http://testserver/api/oauth/authorize/",
    );
    expect(body.token_endpoint).toBe("http://testserver/api/oauth/token/");
    expect(body.registration_endpoint).toBe(
      "http://testserver/api/oauth/register/",
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
      expect(body.resource).toBe("http://testserver/api/mcp/");
      expect(body.authorization_servers).toContain("http://testserver");
    }
  });
});

describe("DCR POST /api/oauth/register/", () => {
  const app = createApp();

  it("registers a public client with PKCE auth method none", async () => {
    rowsFor = (sql) => {
      if (sql.includes("INSERT INTO oauth2_provider_application")) {
        return [appRow({ client_id: "generated-id", client_type: "public" })];
      }
      return [];
    };
    const res = await app.request(
      "/api/oauth/register/",
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
      `http://testserver/api/oauth/register/${payload.client_id}/`,
    );
    expect(
      calls.some((c) => c.sql.includes("INSERT INTO oauth2_provider_application")),
    ).toBe(true);
    expect(
      calls.some((c) => c.sql.includes("INSERT INTO oauth2_provider_accesstoken")),
    ).toBe(true);
  });

  it("returns plaintext client_secret for confidential clients", async () => {
    rowsFor = (sql) => {
      if (sql.includes("INSERT INTO oauth2_provider_application")) {
        return [
          appRow({
            client_id: "conf-id",
            client_type: "confidential",
            client_secret: "pbkdf2_sha256$1200000$salt$hash",
          }),
        ];
      }
      return [];
    };
    const res = await app.request(
      "/api/oauth/register/",
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
      "/api/oauth/register/",
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
      "/api/oauth/register/",
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
      "/api/oauth/register/",
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
      sql.includes("FROM oauth2_provider_application") ? [appRow()] : [];
    const { challenge } = await pkcePair();
    const url =
      "/api/oauth/authorize/?response_type=code&client_id=client-abc" +
      "&redirect_uri=" +
      encodeURIComponent("http://127.0.0.1:33418/callback") +
      "&code_challenge=" +
      challenge +
      "&code_challenge_method=S256&scope=read";
    const res = await app.request(url, {}, ENV);
    expect(res.status).toBe(302);
    const loc = res.headers.get("Location")!;
    expect(loc.startsWith("http://localhost:3000/login?next=")).toBe(true);
    expect(loc).toContain(encodeURIComponent("/api/oauth/authorize/"));
  });

  it("renders consent HTML for authenticated cookie JWT", async () => {
    rowsFor = (sql) =>
      sql.includes("FROM oauth2_provider_application") ? [appRow()] : [];
    const { challenge } = await pkcePair();
    const url =
      "/api/oauth/authorize/?response_type=code&client_id=client-abc" +
      "&redirect_uri=" +
      encodeURIComponent("http://127.0.0.1:33418/callback") +
      "&code_challenge=" +
      challenge +
      "&code_challenge_method=S256&scope=read";
    const res = await app.request(
      url,
      { headers: { Cookie: await accessCookie() } },
      ENV,
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Authorize Claude Desktop?");
    expect(html).toContain("127.0.0.1");
    expect(html).toContain("csrfmiddlewaretoken");
    expect(html).toContain("Dynamic Client Registration");
  });

  it("issues code on consent POST and exchanges with PKCE", async () => {
    const { verifier, challenge } = await pkcePair();
    const csrf = issueCsrfToken(undefined);
    let grantDeleted = false;

    rowsFor = (sql, args) => {
      if (sql.includes("FROM oauth2_provider_application")) {
        return [appRow()];
      }
      if (sql.includes("INSERT INTO oauth2_provider_grant")) {
        return [];
      }
      if (sql.includes("FROM oauth2_provider_grant")) {
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
            resource: ["http://testserver/api/mcp/"],
          },
        ];
      }
      if (sql.includes("INSERT INTO oauth2_provider_accesstoken")) {
        returningId += 1;
        return [{ id: returningId }];
      }
      if (sql.includes("DELETE FROM oauth2_provider_grant")) {
        grantDeleted = true;
        return [];
      }
      return [];
    };

    const form = new URLSearchParams({
      csrfmiddlewaretoken: csrf.token,
      allow: "True",
      client_id: "client-abc",
      redirect_uri: "http://127.0.0.1:33418/callback",
      response_type: "code",
      scope: "read",
      state: "xyz",
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource: "http://testserver/api/mcp/",
      nonce: "",
    });

    const authRes = await app.request(
      "/api/oauth/authorize/",
      {
        method: "POST",
        headers: {
          Cookie: `${await accessCookie()}; csrftoken=${csrf.secret}`,
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
      "/api/oauth/token/",
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
      if (sql.includes("FROM oauth2_provider_application")) return [appRow()];
      if (sql.includes("FROM oauth2_provider_grant")) {
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
      "/api/oauth/token/",
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
      if (sql.includes("FROM oauth2_provider_application")) return [appRow()];
      if (
        sql.includes("FROM oauth2_provider_refreshtoken r") &&
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
      if (sql.includes("INSERT INTO oauth2_provider_accesstoken")) {
        return [{ id: 11 }];
      }
      return [];
    };
    const res = await app.request(
      "/api/oauth/token/",
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
      sql.includes("FROM oauth2_provider_application") ? [appRow()] : [];
    const opaque = "access-to-revoke";
    const res = await app.request(
      "/api/oauth/revoke_token/",
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
      c.sql.includes("DELETE FROM oauth2_provider_accesstoken"),
    );
    expect(del?.args[0]).toBe(checksum);
  });
});
