import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { oauthProviderConfig } from "../src/lib/auth";
import type { Bindings } from "../src/types/bindings";

vi.mock("pg", () => {
  class FakeClient {
    async connect() {}
    async end() {}
    async query() {
      return { rows: [], rowCount: 0 };
    }
  }
  return { default: { Client: FakeClient } };
});

const BINDINGS = {
  ENVIRONMENT: "test",
  BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
  BETTER_AUTH_URL: "https://api.example.com",
  FRONTEND_URL: "https://app.example.com",
  CORS_ALLOW_ORIGIN: "https://app.example.com",
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
} as unknown as Bindings;
const ENV = BINDINGS as Parameters<ReturnType<typeof createApp>["request"]>[2];

describe("OAuth discovery", () => {
  it("seeds the environment-specific MCP resource for new DCR clients", () => {
    const config = oauthProviderConfig(BINDINGS);
    expect(config.resources).toEqual([
      expect.objectContaining({
        identifier: "https://api.example.com/api/mcp",
        allowedScopes: expect.arrayContaining(["videoq.read", "videoq.write"]),
        accessTokenTtl: 300,
      }),
    ]);
    expect(config.clientRegistrationDefaultResources).toEqual([
      "https://api.example.com/api/mcp",
    ]);
    expect(config.resourceSeedMode).toBe("merge");
  });

  it("serves RFC 8414 metadata at the common MCP discovery paths", async () => {
    for (const path of [
      "/.well-known/oauth-authorization-server",
      "/.well-known/oauth-authorization-server/api/auth",
      "/.well-known/oauth-authorization-server/mcp",
      "/.well-known/oauth-authorization-server/api/mcp",
    ]) {
      const res = await createApp().request(path, {}, ENV);
      expect(res.status).toBe(200);
      const metadata = await res.json();
      expect(metadata).toMatchObject({
        issuer: "https://api.example.com/api/auth",
        authorization_endpoint: "https://api.example.com/api/auth/oauth2/authorize",
      });
      expect(metadata.scopes_supported).toEqual(
        expect.arrayContaining(["videoq.read", "videoq.write"]),
      );
    }
  });

  it("serves RFC 9728 metadata at both resource well-known URLs", async () => {
    const expected = {
      resource: "https://api.example.com/api/mcp",
      authorization_servers: ["https://api.example.com/api/auth"],
      scopes_supported: [
        "videoq.read",
        "videoq.write",
      ],
    };
    for (const path of [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/api/mcp",
    ]) {
      const res = await createApp().request(path, {}, ENV);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        ...expected,
        dpop_signing_alg_values_supported: expect.arrayContaining(["ES256"]),
      });
    }
  });

  it("serves OpenID metadata below the issuer path", async () => {
    const res = await createApp().request(
      "/api/auth/.well-known/openid-configuration",
      {},
      ENV,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      issuer: "https://api.example.com/api/auth",
    });
  });
});
