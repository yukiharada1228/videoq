import { describe, it, expect, vi, beforeEach } from "vitest";
import { videoRoutes } from "../src/features/videos/routes";
import { signAccessToken } from "./helpers/auth";

import {
  isAuthSessionActiveSql,
  matchableSql,
  normalizePgQuery,
  TEST_AUTH_SESSION_ID,
  type MatchableSql,
  type PgQueryInput,
} from "./helpers/pg-fake";

const putMock = vi.fn();
const queryMock = vi.fn();

vi.mock("pg", () => {
  class FakeClient {
    async connect() {}
    async end() {}
    async query(sqlOrConfig: unknown, args: unknown[] = []) {
      const { sql, args: a, rowMode } = normalizePgQuery(
        sqlOrConfig as PgQueryInput,
        args,
      );
      const matchSql = matchableSql(sql);
      const result = queryMock(matchSql, a);
      if (rowMode === "array" && result.rows?.length) {
        return {
          ...result,
          rows: result.rows.map((r: Record<string, unknown> | unknown[]) =>
            Array.isArray(r) ? r : Object.values(r),
          ),
        };
      }
      return result;
    }
  }
  return { default: { Client: FakeClient } };
});

vi.mock("../src/lib/jobs", () => ({
  enqueueTranscription: vi.fn().mockResolvedValue(undefined),
  enqueueReindexTranscript: vi.fn().mockResolvedValue(undefined),
}));

const SECRET = "test-jwt-secret-videos-multipart";
const baseEnv = {
  ENVIRONMENT: "development",
  AUTH_JWT_SECRET: SECRET,
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
  VIDEO_BUCKET: {
    put: (...a: unknown[]) => putMock(...a),
    head: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
};

async function accessToken(userId = "00000000-0000-4000-8000-000000000005") {
  return signAccessToken(SECRET, userId);
}

beforeEach(() => {
  putMock.mockReset().mockResolvedValue(undefined);
  queryMock.mockReset().mockImplementation((sql: MatchableSql, args: unknown[] = []) => {
    if (isAuthSessionActiveSql(sql) && args[0] === TEST_AUTH_SESSION_ID) {
      return { rows: [{ ok: 1 }], rowCount: 1 };
    }
    if (sql.includes("max_video_upload_size_mb")) {
      return { rows: [{ max_video_upload_size_mb: 500 }], rowCount: 1 };
    }
    if (sql.includes("storage_limit_gb") || sql.includes("is_over_quota")) {
      return { rows: [{ storage_limit_gb: null, is_over_quota: false }], rowCount: 1 };
    }
    if (sql.includes("used_storage_bytes")) {
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("videos") && sql.includes("returning")) {
      return { rows: [{ id: 42 }], rowCount: 1 };
    }
    if (sql.includes("videos") && sql.includes("select")) {
      return {
        rows: [
          {
            id: 42,
            user_id: "00000000-0000-4000-8000-000000000005",
            file: "videos/5/video_1_4.mp4",
            title: "Clip",
            description: "",
            uploaded_at: "2026-01-01T00:00:00.000000-06:00",
            transcript: "",
            status: "pending",
            source_type: "uploaded",
            source_url: "",
            youtube_video_id: "",
            error_message: "",
            tags: "[]",
          },
        ],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  });
});

describe("POST / — USE_S3_STORAGE=true（廃線）", () => {
  const ENV = { ...baseEnv, USE_S3_STORAGE: "true" } as unknown as Record<string, unknown>;

  it("認証済みでも 400 で署名 URL 経路を案内する", async () => {
    const res = await videoRoutes.request(
      "/",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000005",
        },
        body: JSON.stringify({ title: "x" }),
      },
      ENV,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "No file was submitted.",
        details: { file: ["No file was submitted."] },
      },
    });
  });
});

describe("POST / — USE_S3_STORAGE=false（multipart）", () => {
  const ENV = { ...baseEnv, USE_S3_STORAGE: "false" } as unknown as Record<string, unknown>;

  it("未認証は 401", async () => {
    const res = await videoRoutes.request(
      "/",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      ENV,
    );
    expect(res.status).toBe(401);
  });

  it("multipart で VIDEO_BUCKET に保存して 201", async () => {
    const form = new FormData();
    form.append("file", new File(["abcd"], "clip.mp4", { type: "video/mp4" }));
    form.append("title", "Clip");
    form.append("description", "");

    const res = await videoRoutes.request(
      "/",
      {
        method: "POST",
        headers: { "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000005" },
        body: form,
      },
      ENV,
    );
    expect(res.status).toBe(201);
    expect(putMock).toHaveBeenCalled();
    const key = putMock.mock.calls[0][0] as string;
    expect(key).toMatch(/^media\/videos\/00000000-0000-4000-8000-000000000005\/video_\d+_\d+\.mp4$/);
    const body = (await res.json()) as { id: number; status: string };
    expect(body.id).toBe(42);
    expect(body.status).toBe("pending");
  });
});

describe("POST /uploads/ — local では不可", () => {
  it("USE_S3_STORAGE=false は 400", async () => {
    const ENV = { ...baseEnv, USE_S3_STORAGE: "false" } as unknown as Record<string, unknown>;
    const res = await videoRoutes.request(
      "/uploads",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-VideoQ-Test-User-Id": "00000000-0000-4000-8000-000000000005",
        },
        body: JSON.stringify({
          filename: "a.mp4",
          content_type: "video/mp4",
          file_size: 10,
          title: "t",
        }),
      },
      ENV,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: {
        message: "Presigned upload URLs are unavailable when USE_S3_STORAGE=False.",
      },
    });
  });
});
