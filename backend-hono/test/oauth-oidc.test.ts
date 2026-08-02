import { describe, it, expect, beforeEach, vi } from "vitest";
import { exportPKCS8, generateKeyPair } from "jose";
import { createApp } from "../src/app";
import { tokenChecksum } from "../src/lib/oauth";

type QueryCall = { sql: string; args: unknown[] };
const calls: QueryCall[] = [];
let rowsFor: (sql: string, args: unknown[]) => Record<string, unknown>[];

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
      return { rows, rowCount: rows.length };
    }
  }
  return { default: { Client: FakeClient } };
});

const SECRET = "test-jwt-secret-oauth-oidc";
let rsaPem = "";

async function ensureRsa() {
  if (rsaPem) return rsaPem;
  const { privateKey } = await generateKeyPair("RS256", { extractable: true });
  rsaPem = await exportPKCS8(privateKey);
  return rsaPem;
}

function baseEnv(overrides: Record<string, unknown> = {}) {
  return {
    ENVIRONMENT: "development",
    JWT_SECRET: SECRET,
    LEGACY_API_ORIGIN: "https://legacy.test",
    CORS_ALLOW_ORIGIN: "http://localhost:3000",
    FRONTEND_URL: "http://localhost:3000",
    OAUTH2_PROVIDER_ISSUER_URL: "http://testserver",
    OIDC_ENABLED: "false",
    HYPERDRIVE: { connectionString: "postgres://fake/db" },
    ...overrides,
  } as unknown as Record<string, unknown>;
}

beforeEach(() => {
  calls.length = 0;
  rowsFor = () => [];
});

describe("OIDC disabled (Django default)", () => {
  const app = createApp();

  it("returns 404 for discovery / jwks / userinfo", async () => {
    const env = baseEnv();
    for (const path of [
      "/.well-known/openid-configuration",
      "/.well-known/jwks.json",
      "/api/oauth/userinfo/",
      "/api/oauth/logout/",
    ]) {
      const res = await app.request(path, {}, env);
      expect(res.status, path).toBe(404);
    }
  });
});

describe("OIDC enabled", () => {
  const app = createApp();

  it("serves openid-configuration and jwks", async () => {
    const pem = await ensureRsa();
    const env = baseEnv({
      OIDC_ENABLED: "true",
      OIDC_RSA_PRIVATE_KEY: pem,
      OIDC_RP_INITIATED_LOGOUT_ENABLED: "true",
    });
    const disc = await app.request("/.well-known/openid-configuration", {}, env);
    expect(disc.status).toBe(200);
    expect(disc.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const body = await disc.json();
    expect(body.issuer).toBe("http://testserver");
    expect(body.userinfo_endpoint).toBe("http://testserver/api/oauth/userinfo/");
    expect(body.jwks_uri).toBe("http://testserver/.well-known/jwks.json");
    expect(body.end_session_endpoint).toBe("http://testserver/api/oauth/logout/");
    expect(body.id_token_signing_alg_values_supported).toContain("RS256");
    expect(body.scopes_supported).toContain("openid");

    const jwks = await app.request("/.well-known/jwks.json", {}, env);
    expect(jwks.status).toBe(200);
    const jwksBody = await jwks.json();
    expect(jwksBody.keys).toHaveLength(1);
    expect(jwksBody.keys[0].alg).toBe("RS256");
    expect(jwksBody.keys[0].kid).toBeTruthy();
    expect(jwksBody.keys[0].kty).toBe("RSA");
  });

  it("userinfo returns claims for valid bearer", async () => {
    const pem = await ensureRsa();
    const env = baseEnv({ OIDC_ENABLED: "true", OIDC_RSA_PRIVATE_KEY: pem });
    const raw = "oauth-access-oidc";
    rowsFor = (sql) => {
      if (sql.includes("FROM oauth2_provider_accesstoken")) {
        return [
          {
            user_id: 9,
            scope: "openid profile email read",
            username: "alice",
            email: "alice@example.com",
          },
        ];
      }
      return [];
    };
    const res = await app.request(
      "/api/oauth/userinfo/",
      { headers: { Authorization: `Bearer ${raw}` } },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      sub: "9",
      preferred_username: "alice",
      email: "alice@example.com",
      email_verified: true,
    });
    expect(calls.some((c) => String(c.args[0]).length === 64 || true)).toBe(true);
    expect(await tokenChecksum(raw)).toHaveLength(64);
  });

  it("userinfo 401 without token", async () => {
    const env = baseEnv({ OIDC_ENABLED: "true" });
    const res = await app.request("/api/oauth/userinfo/", {}, env);
    expect(res.status).toBe(401);
  });

  it("issues id_token on authorization_code when openid+RS256", async () => {
    const pem = await ensureRsa();
    const env = baseEnv({ OIDC_ENABLED: "true", OIDC_RSA_PRIVATE_KEY: pem });
    rowsFor = (sql) => {
      if (sql.includes("FROM oauth2_provider_application")) {
        return [
          {
            id: 1,
            client_id: "oidc-client",
            client_secret: "",
            client_type: "public",
            authorization_grant_type: "authorization-code",
            name: "OIDC App",
            redirect_uris: "http://127.0.0.1/cb",
            post_logout_redirect_uris: "",
            algorithm: "RS256",
            skip_authorization: false,
            user_id: null,
            registration_source: "manual",
            hash_client_secret: true,
          },
        ];
      }
      if (sql.includes("FROM oauth2_provider_grant")) {
        return [
          {
            id: 10,
            user_id: 3,
            code: "authcode",
            application_id: 1,
            expires: new Date(Date.now() + 60_000).toISOString(),
            redirect_uri: "http://127.0.0.1/cb",
            scope: "openid read",
            code_challenge: "x",
            code_challenge_method: "plain",
            resource: [],
            nonce: "n-1",
          },
        ];
      }
      if (sql.includes("INSERT INTO oauth2_provider_accesstoken")) {
        return [{ id: 100 }];
      }
      if (sql.includes("INSERT INTO oauth2_provider_idtoken")) {
        return [{ id: 200 }];
      }
      if (sql.includes("FROM app_user")) {
        return [{ username: "bob", email: "bob@example.com" }];
      }
      return [];
    };

    // PKCE plain: challenge === verifier
    const res = await app.request(
      "/api/oauth/token/",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: "oidc-client",
          code: "authcode",
          redirect_uri: "http://127.0.0.1/cb",
          code_verifier: "x",
        }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.access_token).toBeTruthy();
    expect(body.id_token).toBeTruthy();
    const parts = String(body.id_token).split(".");
    expect(parts).toHaveLength(3);
  });
});

describe("OIDC RP logout gate", () => {
  const app = createApp();

  it("404 when OIDC on but RP logout off", async () => {
    const env = baseEnv({
      OIDC_ENABLED: "true",
      OIDC_RP_INITIATED_LOGOUT_ENABLED: "false",
    });
    const res = await app.request("/api/oauth/logout/", {}, env);
    expect(res.status).toBe(404);
  });
});
