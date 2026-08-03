import { describe, it, expect, beforeEach, vi } from "vitest";
import { opsRoutes } from "../src/features/ops/routes";
import { signAccessToken } from "./helpers/auth";

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

const enqueueAll = vi.fn();
vi.mock("../src/lib/jobs", () => ({
  enqueueReindexAllEmbeddings: (...a: unknown[]) => enqueueAll(...a),
}));

const SECRET = "test-jwt-secret-ops";
const ENV = {
  ENVIRONMENT: "development",
  AUTH_JWT_SECRET: SECRET,
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
} as unknown as Record<string, unknown>;

async function token(userId = 1) {
  return signAccessToken(SECRET, userId);
}

beforeEach(() => {
  calls.length = 0;
  enqueueAll.mockReset().mockResolvedValue("job-abc");
  rowsFor = (sql) => {
    if (sql.includes("SELECT is_superuser")) return [{ is_superuser: true }];
    if (sql.includes("count(*)")) return [{ c: 1 }];
    if (sql.includes("FROM users") || sql.includes("RETURNING id")) {
      return [
        {
          id: 9,
          username: "alice",
          email: "a@example.com",
          is_active: true,
          is_staff: true,
          is_superuser: false,
          max_video_upload_size_mb: 500,
          storage_limit_gb: 10,
          processing_limit_minutes: 60,
          ai_answers_limit: 100,
          used_storage_bytes: 0,
          used_processing_seconds: 0,
          used_ai_answers: 0,
          usage_period_start: null,
          is_over_quota: false,
        },
      ];
    }
    return [];
  };
});

const req = (path: string, init: RequestInit = {}) =>
  opsRoutes.request(path, init, ENV);

describe("ops API", () => {
  it("非 superuser は 403", async () => {
    rowsFor = (sql) => {
      if (sql.includes("SELECT is_superuser")) return [{ is_superuser: false }];
      return [];
    };
    const res = await req("/api/ops/users", {
      headers: { authorization: `Bearer ${await token(2)}` },
    });
    expect(res.status).toBe(403);
  });

  it("一覧は 200", async () => {
    const res = await req("/api/ops/users?q=ali", {
      headers: { authorization: `Bearer ${await token()}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { meta: { total: number }; data: { id: number }[] };
    expect(body.meta.total).toBe(1);
    expect(body.data[0].id).toBe(9);
  });

  it("quota PATCH", async () => {
    const res = await req("/api/ops/users/9/quota", {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${await token()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ storage_limit_gb: 50 }),
    });
    expect(res.status).toBe(200);
    expect(calls.some((c) => c.sql.includes("UPDATE users"))).toBe(true);
  });

  it("reindex-all は 202 + job_id", async () => {
    const res = await req("/api/ops/embeddings/reindex-all", {
      method: "POST",
      headers: { authorization: `Bearer ${await token()}` },
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ job_id: "job-abc" });
    expect(enqueueAll).toHaveBeenCalled();
  });
});
