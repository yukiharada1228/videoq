import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mcpRoutes } from "../src/routes/mcp";
import { sha256Hex } from "../src/utils/crypto";

type QueryCall = { sql: string; args: unknown[] };
const calls: QueryCall[] = [];
let rowsFor: (sql: string, args: unknown[]) => Record<string, unknown>[];

vi.mock("pg", () => {
  class FakeClient {
    async connect() {}
    async end() {}
    async query(sql: string, args: unknown[] = []) {
      calls.push({ sql, args });
      const rows = rowsFor(sql, args);
      return { rows, rowCount: rows.length };
    }
  }
  return { default: { Client: FakeClient } };
});

const ENV = {
  ENVIRONMENT: "development",
  JWT_SECRET: "unused-for-mcp-api-key",
  LEGACY_API_ORIGIN: "https://legacy.test",
  OAUTH2_PROVIDER_ISSUER_URL: "https://api.example.com",
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
} as unknown as Record<string, unknown>;

const RAW_KEY = "vq_mcp_test_key_value_xxxxxx";

const apiKeyRow = (accessLevel = "all") => [
  { api_key_id: 1, user_id: 5, access_level: accessLevel },
];

beforeEach(() => {
  calls.length = 0;
  rowsFor = (sql) => {
    if (sql.includes("UPDATE app_userapikey")) return apiKeyRow();
    return [];
  };
});
afterEach(() => vi.unstubAllGlobals());

const jsonrpc = (method: string, params?: unknown, id: number | null = 1) => {
  const body: Record<string, unknown> = { jsonrpc: "2.0", method };
  if (id !== null) body.id = id;
  if (params !== undefined) body.params = params;
  return body;
};

const post = (body: unknown, headers: Record<string, string> = {}) =>
  mcpRoutes.request(
    "/api/mcp",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${RAW_KEY}`,
        ...headers,
      },
      body: JSON.stringify(body),
    },
    ENV,
  );

describe("MCP auth", () => {
  it("rejects unauthenticated with WWW-Authenticate resource_metadata", async () => {
    const res = await mcpRoutes.request(
      "/api/mcp",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(jsonrpc("initialize")),
      },
      ENV,
    );
    expect(res.status).toBe(401);
    const challenge = res.headers.get("WWW-Authenticate") ?? "";
    expect(challenge).toContain('Bearer realm="api"');
    expect(challenge).toContain(
      'resource_metadata="https://api.example.com/.well-known/oauth-protected-resource/api/mcp"',
    );
  });

  it("accepts X-API-Key", async () => {
    const res = await mcpRoutes.request(
      "/api/mcp",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": RAW_KEY,
        },
        body: JSON.stringify(jsonrpc("initialize")),
      },
      ENV,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.serverInfo.name).toBe("videoq-api");
  });

  it("accepts OAuth bearer via token_checksum", async () => {
    const opaque = "oauth-access-token-value";
    const checksum = await sha256Hex(opaque);
    rowsFor = (sql, args) => {
      if (sql.includes("FROM oauth2_provider_accesstoken")) {
        expect(args[0]).toBe(checksum);
        return [{ user_id: 9, scope: "mcp" }];
      }
      return [];
    };
    const res = await mcpRoutes.request(
      "/api/mcp",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${opaque}`,
        },
        body: JSON.stringify(jsonrpc("ping")),
      },
      ENV,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ jsonrpc: "2.0", id: 1, result: {} });
  });

  it("rejects read_only API key (POST requires write)", async () => {
    rowsFor = (sql) =>
      sql.includes("UPDATE app_userapikey") ? apiKeyRow("read_only") : [];
    const res = await post(jsonrpc("initialize"));
    expect(res.status).toBe(403);
  });
});

describe("MCP JSON-RPC", () => {
  it("serves /api/mcp without trailing slash (no redirect)", async () => {
    const res = await post(jsonrpc("initialize", { protocolVersion: "2025-03-26" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.protocolVersion).toBe("2025-03-26");
    expect(body.result.serverInfo).toEqual({
      name: "videoq-api",
      version: "0.2.0",
    });
  });

  it("lists all tools", async () => {
    const res = await post(jsonrpc("tools/list"));
    const names = (await res.json()).result.tools.map((t: { name: string }) => t.name);
    expect(names.sort()).toEqual(
      [
        "list_videos",
        "get_video",
        "list_groups",
        "get_group",
        "list_tags",
        "get_chat_history",
        "get_chat_analytics",
        "get_evaluation_summary",
        "list_evaluation_logs",
      ].sort(),
    );
  });

  it("tools/call list_videos returns empty envelope", async () => {
    rowsFor = (sql) => {
      if (sql.includes("UPDATE app_userapikey")) return apiKeyRow();
      if (sql.includes("count(*)") && sql.includes("app_video")) {
        return [{ c: 0 }];
      }
      return [];
    };
    const res = await post(
      jsonrpc("tools/call", { name: "list_videos", arguments: {} }),
    );
    const result = (await res.json()).result;
    expect(result.isError).toBe(false);
    expect(result.structuredContent).toEqual({
      count: 0,
      next: null,
      previous: null,
      videos: [],
    });
  });

  it("tools/call get_video not found → isError", async () => {
    rowsFor = (sql) =>
      sql.includes("UPDATE app_userapikey") ? apiKeyRow() : [];
    const res = await post(
      jsonrpc("tools/call", {
        name: "get_video",
        arguments: { video_id: 404 },
      }),
    );
    const result = (await res.json()).result;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Video not found");
    expect(result.structuredContent).toEqual({ status: 404 });
  });

  it("GET returns 405", async () => {
    const res = await mcpRoutes.request(
      "/api/mcp/",
      { method: "GET", headers: { authorization: `Bearer ${RAW_KEY}` } },
      ENV,
    );
    expect(res.status).toBe(405);
  });

  it("DELETE returns 204", async () => {
    const res = await mcpRoutes.request(
      "/api/mcp/",
      { method: "DELETE", headers: { authorization: `Bearer ${RAW_KEY}` } },
      ENV,
    );
    expect(res.status).toBe(204);
  });

  it("notification without id returns 202", async () => {
    const res = await post(jsonrpc("notifications/initialized", undefined, null));
    expect(res.status).toBe(202);
  });
});
