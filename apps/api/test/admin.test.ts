import { describe, it, expect, beforeEach, vi } from "vitest";
import { adminRoutes } from "../src/features/admin/routes";
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
const processExternalTask = vi.fn();
vi.mock("../src/lib/external-tasks", () => ({
  processExternalTaskById: (...a: unknown[]) => processExternalTask(...a),
}));

const SECRET = "test-jwt-secret-admin";
const ENV = {
  ENVIRONMENT: "development",
  AUTH_JWT_SECRET: SECRET,
  BETTER_AUTH_SECRET: SECRET,
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
} as unknown as Record<string, unknown>;

async function token(userId = "00000000-0000-4000-8000-000000000001") {
  return signAccessToken(SECRET, userId);
}

beforeEach(() => {
  calls.length = 0;
  enqueueAll.mockReset().mockResolvedValue("job-abc");
  processExternalTask.mockReset().mockResolvedValue(true);
  rowsFor = (sql) => {
    if (sql.includes("SELECT is_superuser")) return [{ is_superuser: true }];
    if (sql.includes("count(*)")) return [{ c: 1 }];
    if (sql.includes("external_tasks") && sql.includes("RETURNING")) {
      return [{ id: 73 }];
    }
    if (sql.includes("FROM users") || sql.includes("RETURNING id")) {
      return [
        {
          id: "00000000-0000-4000-8000-000000000009",
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
  adminRoutes.request(path, init, ENV);

describe("admin API", () => {
  it("非 superuser は 403", async () => {
    rowsFor = (sql) => {
      if (sql.includes("SELECT is_superuser")) return [{ is_superuser: false }];
      return [];
    };
    const res = await req("/users", {
      headers: { "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000001" },
    });
    expect(res.status).toBe(403);
  });

  it("一覧は 200", async () => {
    const res = await req("/users?q=ali", {
      headers: { "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000001" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { meta: { total: number }; data: { id: number }[] };
    expect(body.meta.total).toBe(1);
    expect(body.data[0].id).toBe("00000000-0000-4000-8000-000000000009");
  });

  it("quota PATCH", async () => {
    const res = await req("/users/00000000-0000-4000-8000-000000000009/quota", {
      method: "PATCH",
      headers: {
        "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000001",
        "content-type": "application/json",
      },
      body: JSON.stringify({ storage_limit_gb: 50 }),
    });
    expect(res.status).toBe(200);
    expect(calls.some((c) => c.sql.includes("UPDATE users"))).toBe(true);
  });

  it("flags PATCH", async () => {
    const res = await req("/users/00000000-0000-4000-8000-000000000009/flags", {
      method: "PATCH",
      headers: {
        "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000001",
        "content-type": "application/json",
      },
      body: JSON.stringify({ is_staff: true, is_superuser: true }),
    });
    expect(res.status).toBe(200);
    expect(calls.some((c) => c.sql.includes("UPDATE") && c.sql.includes("users"))).toBe(
      true,
    );
  });

  it("自分の superuser フラグは外せない", async () => {
    rowsFor = (sql) => {
      if (sql.includes("SELECT is_superuser")) return [{ is_superuser: true }];
      if (sql.includes("FROM users")) {
        return [
          {
            id: "00000000-0000-4000-8000-000000000001",
            username: "admin",
            email: "admin@example.com",
            is_active: true,
            is_staff: true,
            is_superuser: true,
            max_video_upload_size_mb: 500,
            storage_limit_gb: null,
            processing_limit_minutes: null,
            ai_answers_limit: null,
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
    const res = await req("/users/00000000-0000-4000-8000-000000000001/flags", {
      method: "PATCH",
      headers: {
        "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000001",
        "content-type": "application/json",
      },
      body: JSON.stringify({ is_superuser: false }),
    });
    expect(res.status).toBe(400);
  });

  it("reindex-all は 202 + job_id", async () => {
    const res = await req("/embeddings/reindex-all", {
      method: "POST",
      headers: { "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000001" },
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ job_id: "job-abc" });
    expect(enqueueAll).toHaveBeenCalled();
  });

  it("ユーザー削除は 202 でジョブを投入する", async () => {
    const res = await req("/users/00000000-0000-4000-8000-000000000009", {
      method: "DELETE",
      headers: { "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000001" },
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { job_id: string };
    expect(body.job_id).toMatch(/[0-9a-f-]{36}/);
    expect(processExternalTask).toHaveBeenCalledWith(ENV, 73);
    expect(calls.some((c) => c.sql.includes("UPDATE") && c.sql.includes("users"))).toBe(
      true,
    );
    expect(calls.some((c) => c.sql.includes("DELETE") && c.sql.includes("session"))).toBe(
      true,
    );
    expect(
      calls.some((c) => c.sql.includes("DELETE") && c.sql.includes("oauth_access_token")),
    ).toBe(true);
    expect(
      calls.some(
        (c) =>
          (c.sql.includes("UPDATE") || c.sql.includes("DELETE")) &&
          c.sql.includes("oauth_refresh_token"),
      ),
    ).toBe(true);
  });

  it("is_active=false で OAuth トークンも消す", async () => {
    const res = await req("/users/00000000-0000-4000-8000-000000000009/flags", {
      method: "PATCH",
      headers: {
        "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000001",
        "content-type": "application/json",
      },
      body: JSON.stringify({ is_active: false }),
    });
    expect(res.status).toBe(200);
    expect(calls.some((c) => c.sql.includes("DELETE") && c.sql.includes("session"))).toBe(
      true,
    );
    expect(
      calls.some((c) => c.sql.includes("DELETE") && c.sql.includes("oauth_access_token")),
    ).toBe(true);
  });

  it("永続化済みの削除ジョブを返し、リクエスト内では削除しない", async () => {
    const res = await req("/users/00000000-0000-4000-8000-000000000009", {
      method: "DELETE",
      headers: { "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000001" },
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { job_id: string };
    expect(body.job_id).toMatch(/[0-9a-f-]{36}/);
    expect(
      calls.some(
        (c) => c.sql.includes("DELETE") && c.sql.includes("scene_embeddings"),
      ),
    ).toBe(false);
    expect(
      calls.some((c) => c.sql.includes("DELETE") && c.sql.includes("users")),
    ).toBe(false);
  });

  it("自分自身は削除できない", async () => {
    rowsFor = (sql) => {
      if (sql.includes("SELECT is_superuser")) return [{ is_superuser: true }];
      if (sql.includes("FROM users")) {
        return [
          {
            id: "00000000-0000-4000-8000-000000000001",
            username: "admin",
            email: "admin@example.com",
            is_active: true,
            is_staff: true,
            is_superuser: true,
            max_video_upload_size_mb: 500,
            storage_limit_gb: null,
            processing_limit_minutes: null,
            ai_answers_limit: null,
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
    const res = await req("/users/00000000-0000-4000-8000-000000000001", {
      method: "DELETE",
      headers: { "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000001" },
    });
    expect(res.status).toBe(400);
    expect(processExternalTask).not.toHaveBeenCalled();
  });

  it("他 superuser は削除できない", async () => {
    rowsFor = (sql) => {
      if (sql.includes("SELECT is_superuser")) return [{ is_superuser: true }];
      if (sql.includes("FROM users")) {
        return [
          {
            id: "00000000-0000-4000-8000-000000000009",
            username: "other-admin",
            email: "other@example.com",
            is_active: true,
            is_staff: true,
            is_superuser: true,
            max_video_upload_size_mb: 500,
            storage_limit_gb: null,
            processing_limit_minutes: null,
            ai_answers_limit: null,
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
    const res = await req("/users/00000000-0000-4000-8000-000000000009", {
      method: "DELETE",
      headers: { "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000001" },
    });
    expect(res.status).toBe(403);
    expect(processExternalTask).not.toHaveBeenCalled();
  });
});
