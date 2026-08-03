import { describe, it, expect, beforeEach, vi } from "vitest";
import { SignJWT } from "jose";
import { createApp } from "../src/app";
import { DEVICE_GRANT_TYPE, tokenChecksum } from "../src/lib/oauth";

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

const SECRET = "test-jwt-secret-oauth-dot-extras";
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

function deviceApp(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 11,
    client_id: "device-client",
    client_secret: "",
    client_type: "public",
    authorization_grant_type: DEVICE_GRANT_TYPE,
    name: "TV App",
    redirect_uris: "",
    post_logout_redirect_uris: "",
    algorithm: "",
    skip_authorization: false,
    user_id: 7,
    registration_source: "manual",
    hash_client_secret: true,
    ...overrides,
  };
}

function deviceGrant(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 99,
    user_id: null,
    device_code: "devcode123",
    user_code: "ABCD1234",
    scope: "read",
    interval: 5,
    expires: new Date(Date.now() + 600_000).toISOString(),
    status: "authorization-pending",
    client_id: "device-client",
    ...overrides,
  };
}

describe("RFC 7662 introspect", () => {
  const app = createApp();

  it("returns active token for authenticated client", async () => {
    const raw = "access-token-value";
    const checksum = await tokenChecksum(raw);
    rowsFor = (sql) => {
      if (
        sql.includes("oauth2_provider_accesstoken") &&
        sql.includes("oauth2_provider_application")
      ) {
        return [
          {
            scope: "read",
            exp: 1_700_000_000,
            client_id: "device-client",
            username: "alice",
          },
        ];
      }
      if (sql.includes("oauth2_provider_application")) {
        return [deviceApp({ authorization_grant_type: "authorization-code" })];
      }
      return [];
    };

    const res = await app.request(
      "/api/oauth/introspect/",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: "device-client",
          token: raw,
        }),
      },
      ENV,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      active: true,
      scope: "read",
      exp: 1_700_000_000,
      client_id: "device-client",
      username: "alice",
    });
    expect(checksum).toHaveLength(64);
  });

  it("returns active:false for unknown token", async () => {
    rowsFor = (sql) => {
      if (sql.includes("oauth2_provider_accesstoken") && sql.includes("token_checksum")) {
        return [];
      }
      if (sql.includes("oauth2_provider_application")) {
        return [deviceApp({ authorization_grant_type: "authorization-code" })];
      }
      return [];
    };
    const res = await app.request(
      "/api/oauth/introspect/",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: "device-client",
          token: "missing",
        }),
      },
      ENV,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ active: false });
  });

  it("allows Bearer with introspection scope", async () => {
    rowsFor = (sql) => {
      if (
        sql.includes("oauth2_provider_accesstoken") &&
        sql.includes("oauth2_provider_application")
      ) {
        return [
          {
            scope: "read",
            exp: 1_700_000_001,
            client_id: "c1",
            username: null,
          },
        ];
      }
      if (
        sql.includes("oauth2_provider_accesstoken") &&
        sql.includes("token_checksum") &&
        !sql.includes("oauth2_provider_application")
      ) {
        return [{ scope: "read introspection" }];
      }
      return [];
    };
    const res = await app.request(
      "/api/oauth/introspect/?token=target",
      {
        method: "GET",
        headers: { Authorization: "Bearer introspector-token" },
      },
      ENV,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.active).toBe(true);
    expect(body.client_id).toBe("c1");
  });

  it("rejects Bearer without introspection scope", async () => {
    rowsFor = (sql) => {
      if (
        sql.includes("oauth2_provider_accesstoken") &&
        sql.includes("scope") &&
        !sql.includes("oauth2_provider_application")
      ) {
        return [{ scope: "read" }];
      }
      return [];
    };
    const res = await app.request(
      "/api/oauth/introspect/?token=target",
      {
        method: "GET",
        headers: { Authorization: "Bearer plain-token" },
      },
      ENV,
    );
    expect(res.status).toBe(403);
  });
});

describe("RFC 8628 device authorization + token poll", () => {
  const app = createApp();

  it("issues device_code and user_code", async () => {
    const grant = deviceGrant();
    rowsFor = (sql) => {
      if (sql.includes("oauth2_provider_application")) {
        return [deviceApp()];
      }
      if (sql.includes("oauth2_provider_devicegrant")) {
        return [grant];
      }
      return [];
    };
    const res = await app.request(
      "/api/oauth/device-authorization/",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: "device-client" }),
      },
      ENV,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.device_code).toBe("devcode123");
    expect(body.user_code).toBe("ABCD1234");
    expect(body.verification_uri).toBe("http://testserver/api/oauth/device/");
    expect(body.interval).toBe(5);
    expect(body.expires_in).toBe(1800);
  });

  it("token poll returns authorization_pending then tokens", async () => {
    let phase: "authorization-pending" | "authorized" = "authorization-pending";
    rowsFor = (sql) => {
      if (sql.includes("oauth2_provider_application")) {
        return [deviceApp()];
      }
      if (sql.includes("oauth2_provider_devicegrant")) {
        return [
          deviceGrant({
            status: phase,
            user_id: phase === "authorized" ? 7 : null,
          }),
        ];
      }
      if (sql.includes("INSERT INTO oauth2_provider_accesstoken")) {
        return [{ id: 501 }];
      }
      return [];
    };

    const pending = await app.request(
      "/api/oauth/token/",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: DEVICE_GRANT_TYPE,
          client_id: "device-client",
          device_code: "devcode123",
        }),
      },
      ENV,
    );
    expect(pending.status).toBe(400);
    expect(await pending.json()).toEqual({ error: "authorization_pending" });

    phase = "authorized";
    const ok = await app.request(
      "/api/oauth/token/",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: DEVICE_GRANT_TYPE,
          client_id: "device-client",
          device_code: "devcode123",
        }),
      },
      ENV,
    );
    expect(ok.status).toBe(200);
    const tokens = await ok.json();
    expect(tokens.token_type).toBe("Bearer");
    expect(tokens.access_token).toBeTruthy();
    expect(tokens.refresh_token).toBeTruthy();
    expect(tokens.scope).toBe("read");
  });

  it("token poll returns access_denied", async () => {
    rowsFor = (sql) => {
      if (sql.includes("oauth2_provider_application")) {
        return [deviceApp()];
      }
      if (sql.includes("oauth2_provider_devicegrant")) {
        return [deviceGrant({ status: "denied", user_id: 7 })];
      }
      return [];
    };
    const res = await app.request(
      "/api/oauth/token/",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: DEVICE_GRANT_TYPE,
          client_id: "device-client",
          device_code: "devcode123",
        }),
      },
      ENV,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "access_denied" });
  });
});

describe("applications / authorized_tokens HTML", () => {
  const app = createApp();

  it("redirects unauthenticated users to frontend login", async () => {
    const res = await app.request("/api/oauth/applications/", {}, ENV);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain(
      "http://localhost:3000/login?next=",
    );
  });

  it("lists applications for cookie user", async () => {
    rowsFor = (sql) => {
      if (sql.includes("oauth2_provider_application") && sql.includes("user_id")) {
        return [deviceApp({ id: 3, name: "My App" })];
      }
      return [];
    };
    const res = await app.request(
      "/api/oauth/applications/",
      { headers: { Cookie: await accessCookie(7) } },
      ENV,
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("My App");
    expect(html).toContain("/api/oauth/applications/3/");
  });

  it("lists authorized tokens HTML", async () => {
    rowsFor = (sql) => {
      if (sql.includes("oauth2_provider_accesstoken")) {
        return [
          {
            id: 42,
            scope: "read",
            client_id: "c1",
            client_name: "Claude",
            issued_at: "2026-01-01T00:00:00+00:00",
            expires_at: "2026-01-01T01:00:00+00:00",
          },
        ];
      }
      return [];
    };
    const cookie = await accessCookie(7);
    const res = await app.request(
      "/api/oauth/authorized_tokens/",
      { headers: { Cookie: cookie } },
      ENV,
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Claude");
    expect(html).toContain("Revoke");
    expect(res.headers.get("set-cookie") || "").toContain("csrftoken=");
  });
});

describe("AS metadata includes DOT extras", () => {
  const app = createApp();

  it("advertises introspect and device endpoints", async () => {
    const res = await app.request(
      "/.well-known/oauth-authorization-server",
      {},
      ENV,
    );
    const body = await res.json();
    expect(body.introspection_endpoint).toBe(
      "http://testserver/api/oauth/introspect/",
    );
    expect(body.device_authorization_endpoint).toBe(
      "http://testserver/api/oauth/device-authorization/",
    );
    expect(body.grant_types_supported).toContain(DEVICE_GRANT_TYPE);
    expect(body.scopes_supported).toContain("introspection");
  });
});
