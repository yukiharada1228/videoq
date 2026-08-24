import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";

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

const ENV = {
  ENVIRONMENT: "test",
  BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
  BETTER_AUTH_URL: "https://api.example.com",
  FRONTEND_URL: "https://app.example.com",
  CORS_ALLOW_ORIGIN: "https://app.example.com",
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
} as unknown as Parameters<ReturnType<typeof createApp>["request"]>[2];

describe("OAuth discovery", () => {
  it("serves RFC 8414 metadata at issuer and ChatGPT probe paths", async () => {
    for (const path of [
      "/.well-known/oauth-authorization-server",
      "/.well-known/oauth-authorization-server/api/auth",
      "/.well-known/oauth-authorization-server/mcp",
      "/.well-known/oauth-authorization-server/api/mcp",
    ]) {
      const res = await createApp().request(path, {}, ENV);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        issuer: "https://api.example.com/api/auth",
        authorization_endpoint: "https://api.example.com/api/auth/oauth2/authorize",
      });
    }
  });

  it("serves RFC 9728 metadata at both resource well-known URLs", async () => {
    const expected = {
      resource: "https://api.example.com/api/mcp",
      authorization_servers: ["https://api.example.com/api/auth"],
      scopes_supported: ["openid", "profile", "email", "offline_access"],
    };
    for (const path of [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/api/mcp",
    ]) {
      const res = await createApp().request(path, {}, ENV);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(expected);
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
