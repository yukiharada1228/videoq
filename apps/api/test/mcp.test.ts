import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createApp } from "../src/app";
import { mcpRoutes } from "../src/features/mcp/routes";

import {
  executeFakePgQuery,
  type PgQueryInput,
  type QueryCall,
  type MatchableSql,
} from "./helpers/pg-fake";

const calls: QueryCall[] = [];
let rowsFor: (sql: MatchableSql, args: unknown[]) => Record<string, unknown>[];

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
      });
    }
  }
  return { default: { Client: FakeClient } };
});

const ENV = {
  ENVIRONMENT: "development",
  AUTH_JWT_SECRET: "unused-for-mcp-api-key",
  OAUTH_ISSUER_URL: "https://api.example.com",
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
} as unknown as Record<string, unknown>;

const RAW_KEY = "vq_mcp_test_key_value_xxxxxx";

const apiKeyRow = (accessLevel = "all") => [
  { api_key_id: 1, user_id: "00000000-0000-4000-8000-000000000005", access_level: accessLevel },
];

beforeEach(() => {
  calls.length = 0;
  rowsFor = (sql) => {
    if (sql.includes("UPDATE api_keys")) return apiKeyRow();
    return [];
  };
});
afterEach(() => vi.unstubAllGlobals());

const initializeParams = {
  protocolVersion: "2025-03-26",
  capabilities: {},
  clientInfo: { name: "videoq-mcp-test", version: "0.0.0" },
};

const jsonrpc = (method: string, params?: unknown, id: number | null = 1) => {
  const body: Record<string, unknown> = { jsonrpc: "2.0", method };
  if (id !== null) body.id = id;
  if (params !== undefined) body.params = params;
  return body;
};

const post = (body: unknown, headers: Record<string, string> = {}) =>
  mcpRoutes.request(
    "/",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "x-api-key": RAW_KEY,
        "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000005",
        ...headers,
      },
      body: JSON.stringify(body),
    },
    ENV,
  );

describe("MCP auth", () => {
  it("rejects unauthenticated with WWW-Authenticate resource_metadata", async () => {
    const res = await mcpRoutes.request(
      "/",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(jsonrpc("initialize", initializeParams)),
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
      "/",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "x-api-key": RAW_KEY,
          "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000005",
          "X-VideoQ-Test-Access-Level": "all",
        },
        body: JSON.stringify(jsonrpc("initialize", initializeParams)),
      },
      ENV,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.serverInfo.name).toBe("videoq-api");
  });

  it("accepts OAuth bearer via test oauth user header", async () => {
    const res = await mcpRoutes.request(
      "/",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: "Bearer oauth-access-token-value",
          "X-VideoQ-Test-OAuth-User-Id": "00000000-0000-4000-8000-000000000009",
        },
        body: JSON.stringify(jsonrpc("ping")),
      },
      ENV,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ jsonrpc: "2.0", id: 1, result: {} });
  });

  it("accepts read_only API key (analytics-only read scope)", async () => {
    const res = await post(jsonrpc("initialize", initializeParams), {
      "X-VideoQ-Test-Access-Level": "read_only",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.serverInfo.name).toBe("videoq-api");
  });
});

describe("MCP JSON-RPC", () => {
  it("serves / without trailing slash (no redirect)", async () => {
    const res = await post(jsonrpc("initialize", initializeParams));
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
      if (sql.includes("UPDATE api_keys")) return apiKeyRow();
      if (sql.includes("count(*)") && sql.includes("videos")) {
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
      meta: { total: 0, limit: 20, offset: 0 },
      data: [],
      videos: [],
    });
  });

  it("tools/call get_video not found → isError", async () => {
    rowsFor = (sql) =>
      sql.includes("UPDATE api_keys") ? apiKeyRow() : [];
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

  it("tools/call coerces string video_id", async () => {
    rowsFor = (sql) =>
      sql.includes("UPDATE api_keys") ? apiKeyRow() : [];
    const res = await post(
      jsonrpc("tools/call", {
        name: "get_video",
        arguments: { video_id: "404" },
      }),
    );
    expect(res.status).toBe(200);
    const result = (await res.json()).result;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe("Video not found");
  });

  it("GET with application/json-only Accept is normalized to open SSE", async () => {
    const res = await mcpRoutes.request(
      "/",
      {
        method: "GET",
        headers: {
          "x-api-key": RAW_KEY,
          "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000005",
          accept: "application/json",
        },
      },
      ENV,
    );
    // Accept 補完により 406 にせず SSE を開く（Claude Code / Cowork 互換）。
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("text/event-stream");
    // ストリームを閉じる（テストがハングしないように）。
    await res.body?.cancel();
  });

  it("POST with non-MCP Accept is normalized and still serves JSON-RPC", async () => {
    const res = await mcpRoutes.request(
      "/",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "text/html",
          "x-api-key": RAW_KEY,
          "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000005",
        },
        body: JSON.stringify(jsonrpc("ping")),
      },
      ENV,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ jsonrpc: "2.0", id: 1, result: {} });
  });
  it("DELETE ends the session with 200", async () => {
    const res = await mcpRoutes.request(
      "/",
      {
        method: "DELETE",
        headers: {
          "x-api-key": RAW_KEY,
          "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000005",
          accept: "application/json, text/event-stream",
        },
      },
      ENV,
    );
    expect(res.status).toBe(200);
  });

  it("notification without id returns 202", async () => {
    const res = await post(jsonrpc("notifications/initialized", undefined, null));
    expect(res.status).toBe(202);
  });
});

describe("MCP connector CORS", () => {
  const app = createApp();

  it("OPTIONS /api/mcp allows Claude.ai with wildcard origin and no credentials", async () => {
    const res = await app.request(
      "/api/mcp",
      {
        method: "OPTIONS",
        headers: {
          Origin: "https://claude.ai",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers":
            "authorization,content-type,accept,mcp-protocol-version",
        },
      },
      ENV,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    const allowHeaders = (
      res.headers.get("Access-Control-Allow-Headers") ?? ""
    ).toLowerCase();
    expect(allowHeaders).toContain("authorization");
    expect(allowHeaders).toContain("mcp-protocol-version");
    expect(allowHeaders).toContain("accept");
    const expose = (
      res.headers.get("Access-Control-Expose-Headers") ?? ""
    ).toLowerCase();
    expect(expose).toContain("www-authenticate");
  });

  it("401 exposes WWW-Authenticate for browser clients", async () => {
    const res = await app.request(
      "/api/mcp",
      {
        method: "POST",
        headers: {
          Origin: "https://claude.ai",
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(jsonrpc("initialize", initializeParams)),
      },
      ENV,
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("WWW-Authenticate")).toContain("resource_metadata=");
    const expose = (
      res.headers.get("Access-Control-Expose-Headers") ?? ""
    ).toLowerCase();
    expect(expose).toContain("www-authenticate");
  });
});
