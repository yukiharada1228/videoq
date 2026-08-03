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
const enqueueDelete = vi.fn();
vi.mock("../src/lib/jobs", () => ({
  enqueueReindexAllEmbeddings: (...a: unknown[]) => enqueueAll(...a),
  enqueueAccountDeletion: (...a: unknown[]) => enqueueDelete(...a),
}));

const SECRET = "test-jwt-secret-admin";
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
  enqueueDelete.mockReset().mockResolvedValue("job-del");
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
  adminRoutes.request(path, init, ENV);

describe("admin API", () => {
  it("非 superuser は 403", async () => {
    rowsFor = (sql) => {
      if (sql.includes("SELECT is_superuser")) return [{ is_superuser: false }];
      return [];
    };
    const res = await req("/api/admin/users", {
      headers: { authorization: `Bearer ${await token(2)}` },
    });
    expect(res.status).toBe(403);
  });

  it("一覧は 200", async () => {
    const res = await req("/api/admin/users?q=ali", {
      headers: { authorization: `Bearer ${await token()}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { meta: { total: number }; data: { id: number }[] };
    expect(body.meta.total).toBe(1);
    expect(body.data[0].id).toBe(9);
  });

  it("quota PATCH", async () => {
    const res = await req("/api/admin/users/9/quota", {
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

  it("flags PATCH", async () => {
    const res = await req("/api/admin/users/9/flags", {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${await token()}`,
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
            id: 1,
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
    const res = await req("/api/admin/users/1/flags", {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${await token(1)}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ is_superuser: false }),
    });
    expect(res.status).toBe(400);
  });

  it("reindex-all は 202 + job_id", async () => {
    const res = await req("/api/admin/embeddings/reindex-all", {
      method: "POST",
      headers: { authorization: `Bearer ${await token()}` },
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ job_id: "job-abc" });
    expect(enqueueAll).toHaveBeenCalled();
  });

  it("ユーザー削除は 202 でジョブを投入する", async () => {
    const res = await req("/api/admin/users/9", {
      method: "DELETE",
      headers: { authorization: `Bearer ${await token(1)}` },
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ job_id: "job-del" });
    expect(enqueueDelete).toHaveBeenCalledWith(ENV, 9);
    expect(calls.some((c) => c.sql.includes("UPDATE") && c.sql.includes("users"))).toBe(
      true,
    );
    expect(calls.some((c) => c.sql.includes("DELETE") && c.sql.includes("auth_sessions"))).toBe(
      true,
    );
    expect(
      calls.some((c) => c.sql.includes("DELETE") && c.sql.includes("oauth_access_tokens")),
    ).toBe(true);
    expect(
      calls.some((c) => c.sql.includes("DELETE") && c.sql.includes("oauth_refresh_tokens")),
    ).toBe(true);
  });

  it("is_active=false で OAuth トークンも消す", async () => {
    const res = await req("/api/admin/users/9/flags", {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${await token()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ is_active: false }),
    });
    expect(res.status).toBe(200);
    expect(calls.some((c) => c.sql.includes("DELETE") && c.sql.includes("auth_sessions"))).toBe(
      true,
    );
    expect(
      calls.some((c) => c.sql.includes("DELETE") && c.sql.includes("oauth_access_tokens")),
    ).toBe(true);
  });

  it("SQS 投入失敗時は同期 hard-delete にフォールバックする", async () => {
    enqueueDelete.mockResolvedValueOnce(null);
    const res = await req("/api/admin/users/9", {
      method: "DELETE",
      headers: { authorization: `Bearer ${await token(1)}` },
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { job_id: string };
    expect(body.job_id.startsWith("sync-")).toBe(true);
    expect(
      calls.some(
        (c) => c.sql.includes("DELETE") && c.sql.includes("scene_embeddings"),
      ),
    ).toBe(true);
    expect(
      calls.some((c) => c.sql.includes("DELETE") && c.sql.includes("users")),
    ).toBe(true);
  });

  it("自分自身は削除できない", async () => {
    rowsFor = (sql) => {
      if (sql.includes("SELECT is_superuser")) return [{ is_superuser: true }];
      if (sql.includes("FROM users")) {
        return [
          {
            id: 1,
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
    const res = await req("/api/admin/users/1", {
      method: "DELETE",
      headers: { authorization: `Bearer ${await token(1)}` },
    });
    expect(res.status).toBe(400);
    expect(enqueueDelete).not.toHaveBeenCalled();
  });

  it("他 superuser は削除できない", async () => {
    rowsFor = (sql) => {
      if (sql.includes("SELECT is_superuser")) return [{ is_superuser: true }];
      if (sql.includes("FROM users")) {
        return [
          {
            id: 9,
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
    const res = await req("/api/admin/users/9", {
      method: "DELETE",
      headers: { authorization: `Bearer ${await token(1)}` },
    });
    expect(res.status).toBe(403);
    expect(enqueueDelete).not.toHaveBeenCalled();
  });
});
