import { describe, it, expect, beforeEach, vi } from "vitest";
import { SignJWT } from "jose";
import { mediaRoutes } from "../src/routes/media";
import { isSafeMediaPath } from "../src/repositories/media-repository";

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

const SECRET = "test-jwt-secret-media";
const bucketStore = new Map<string, Uint8Array>();

const ENV = {
  ENVIRONMENT: "development",
  JWT_SECRET: SECRET,
  LEGACY_API_ORIGIN: "https://legacy.test",
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
  VIDEO_BUCKET: {
    async get(key: string) {
      const data = bucketStore.get(key);
      if (!data) return null;
      return {
        body: data,
        httpEtag: '"etag"',
        writeHttpMetadata(headers: Headers) {
          headers.set("Content-Type", "video/mp4");
          headers.set("Content-Length", String(data.byteLength));
        },
      };
    },
  },
} as unknown as Record<string, unknown>;

beforeEach(() => {
  calls.length = 0;
  bucketStore.clear();
  rowsFor = () => [];
});

async function accessToken(userId = 5) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ token_type: "access", user_id: userId, jti: "j" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(new TextEncoder().encode(SECRET));
}

describe("isSafeMediaPath", () => {
  it("rejects traversal and absolute paths", () => {
    expect(isSafeMediaPath("videos/a.mp4")).toBe(true);
    expect(isSafeMediaPath("../secret")).toBe(false);
    expect(isSafeMediaPath("/etc/passwd")).toBe(false);
    expect(isSafeMediaPath("videos/../../../etc/passwd")).toBe(false);
  });
});

describe("GET /api/media/*", () => {
  it("401 without credentials", async () => {
    const res = await mediaRoutes.request("/api/media/videos/a.mp4", {}, ENV);
    expect(res.status).toBe(401);
  });

  it("404 on path traversal even when authenticated", async () => {
    const res = await mediaRoutes.request(
      "/api/media/../secret",
      { headers: { authorization: `Bearer ${await accessToken()}` } },
      ENV,
    );
    expect(res.status).toBe(404);
  });

  it("streams owned object from R2", async () => {
    bucketStore.set("media/videos/a.mp4", new TextEncoder().encode("mp4data"));
    rowsFor = (sql) => {
      if (sql.includes("app_video") && sql.includes("file")) return [{ id: 9 }];
      if (sql.includes("app_video") && sql.includes("user_id")) return [{ id: 9 }];
      return [];
    };
    const res = await mediaRoutes.request(
      "/api/media/videos/a.mp4",
      { headers: { authorization: `Bearer ${await accessToken()}` } },
      ENV,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("mp4data");
  });

  it("allows share_slug when video is in the shared group", async () => {
    bucketStore.set("media/videos/a.mp4", new TextEncoder().encode("x"));
    rowsFor = (sql) => {
      if (sql.includes("app_videogroup") && sql.includes("share_slug")) {
        return [{ id: 3 }];
      }
      if (sql.includes("app_video") && sql.includes("file")) return [{ id: 9 }];
      if (sql.includes("app_videogroupmember")) return [{ id: 1 }];
      return [];
    };
    const res = await mediaRoutes.request(
      "/api/media/videos/a.mp4?share_slug=abc",
      {},
      ENV,
    );
    expect(res.status).toBe(200);
  });
});
