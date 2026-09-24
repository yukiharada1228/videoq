import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createVideoFromMultipart, requestPresignedUpload } from "../src/features/videos/service";
import * as media from "../src/integrations/media";
import * as externalTasks from "../src/lib/external-tasks";
import { reserveAndCreatePendingVideo } from "../src/repositories/video-repository";
import type { CreationIdempotency } from "../src/repositories/mcp-idempotency-repository";
import type { Bindings } from "../src/types/bindings";

const databaseUrl = process.env.QUOTA_TEST_DATABASE_URL;
const MIB = 1024 * 1024;
type UploadMode = "presigned" | "multipart";
const modes: UploadMode[] = ["presigned", "multipart"];

(databaseUrl ? describe : describe.skip)("upload reservation limits on PostgreSQL", () => {
  const schema = `upload_reservation_${crypto.randomUUID().replaceAll("-", "")}`;
  let admin: pg.Client;
  let env: Bindings;
  const armAt = vi.fn(async () => {});

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: databaseUrl });
    await admin.connect();
    await admin.query(`
      CREATE SCHEMA "${schema}";
      SET search_path TO "${schema}";
      CREATE TABLE users (
        id text PRIMARY KEY, max_video_upload_size_mb integer NOT NULL DEFAULT 1,
        is_over_quota boolean NOT NULL DEFAULT false, storage_limit_gb numeric DEFAULT 10,
        used_storage_bytes bigint NOT NULL DEFAULT 0
      );
      CREATE TABLE videos (
        id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_id text REFERENCES users,
        file text NOT NULL UNIQUE, title text NOT NULL, description text NOT NULL,
        status text NOT NULL, source_type text NOT NULL, source_url text NOT NULL,
        youtube_video_id text NOT NULL, transcript text NOT NULL, error_message text NOT NULL,
        processing_seconds integer NOT NULL DEFAULT 0, uploaded_at timestamptz NOT NULL
      );
      CREATE TABLE tags (id integer PRIMARY KEY, name text, color text);
      CREATE TABLE video_tags (id integer PRIMARY KEY, video_id integer REFERENCES videos, tag_id integer REFERENCES tags);
      CREATE TABLE mcp_idempotency_records (
        user_id text NOT NULL, action text NOT NULL, key text NOT NULL,
        request_hash text NOT NULL, resource_id bigint NOT NULL, created_at timestamptz NOT NULL,
        PRIMARY KEY (user_id, action, key)
      );
      CREATE TABLE external_tasks (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        kind text NOT NULL, payload jsonb NOT NULL, dedupe_key text NOT NULL UNIQUE,
        attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
        locked_at timestamptz, completed_at timestamptz, dead_at timestamptz,
        effect_applied_at timestamptz, last_error text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    const url = new URL(databaseUrl!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    url.searchParams.set("application_name", schema);
    env = {
      HYPERDRIVE: { connectionString: url.toString() }, USE_S3_STORAGE: "true",
      TASK_SCHEDULER: { getByName: () => ({ armAt }) },
    } as unknown as Bindings;
  });
  beforeEach(async () => {
    await admin.query("TRUNCATE users, videos, video_tags, mcp_idempotency_records, external_tasks RESTART IDENTITY");
    await admin.query("INSERT INTO users (id) VALUES ('owner')");
    armAt.mockClear();
    vi.spyOn(media, "presignR2Put").mockResolvedValue("https://uploads.example.test/video");
    vi.spyOn(media, "putMediaObject").mockResolvedValue(undefined);
    vi.spyOn(media, "resolveFileUrl").mockImplementation(async (_env, key) => key ? `/api/media/${key}` : null);
    vi.spyOn(externalTasks, "processExternalTaskById").mockResolvedValue(true);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await admin.end(); }
  });

  function upload(mode: UploadMode, bytes = MIB, idempotency?: CreationIdempotency) {
    return mode === "presigned"
      ? requestPresignedUpload(env, "owner", {
        filename: "clip.mp4", content_type: "video/mp4", file_size: bytes, title: "Clip", description: "",
      }, idempotency)
      : createVideoFromMultipart({ ...env, USE_S3_STORAGE: "false" }, "owner", {
        file: new File([new Uint8Array(bytes)], "clip.mp4", { type: "video/mp4" }), title: "Clip", description: "",
      });
  }

  function expectTooLarge(result: unknown, mode: UploadMode, maxMb = 1) {
    expect(result).toEqual(mode === "presigned" ? { fileTooLarge: true, maxMb } : {
      ok: false, status: 400, body: { error: {
        code: "FILE_TOO_LARGE", message: `File size exceeds the limit of ${maxMb} MB.`, params: { max_size_mb: maxMb },
      } },
    });
  }

  async function expectNoReservation() {
    expect((await admin.query("SELECT used_storage_bytes FROM users WHERE id = 'owner'")).rows)
      .toEqual([{ used_storage_bytes: "0" }]);
    for (const table of ["videos", "mcp_idempotency_records", "external_tasks"]) {
      expect((await admin.query(`SELECT * FROM ${table}`)).rows).toEqual([]);
    }
    expect(media.presignR2Put).not.toHaveBeenCalled();
    expect(media.putMediaObject).not.toHaveBeenCalled();
    expect(externalTasks.processExternalTaskById).not.toHaveBeenCalled();
    expect(armAt).not.toHaveBeenCalled();
  }

  it.each(modes)("accepts the exact file-size limit without a separate limit connection (%s)", async mode => {
    const connect = vi.spyOn(pg.Client.prototype, "connect");
    const result = await upload(mode);
    expect(result).toMatchObject({ video: { id: 1, status: mode === "presigned" ? "uploading" : "pending" } });
    expect(connect).toHaveBeenCalledTimes(mode === "presigned" ? 2 : 3);
    expect((await admin.query("SELECT used_storage_bytes FROM users")).rows).toEqual([{ used_storage_bytes: String(MIB) }]);
  });

  it.each(modes)("rejects one byte over the limit before any reservation or media write (%s)", async mode => {
    expectTooLarge(await upload(mode, MIB + 1), mode);
    await expectNoReservation();
  });

  it.each(modes)("honors a zero-byte upload allowance (%s)", async mode => {
    await admin.query("UPDATE users SET max_video_upload_size_mb = 0");
    expectTooLarge(await upload(mode, 1), mode, 0);
    await expectNoReservation();
  });

  it.each(modes)("keeps size errors ahead of storage quota errors (%s)", async mode => {
    await admin.query("UPDATE users SET is_over_quota = true, storage_limit_gb = 0");
    expectTooLarge(await upload(mode, MIB + 1), mode);
    await expectNoReservation();
  });

  it.each(modes.flatMap(mode => ["decrease", "increase"].map(change => ({ mode, change }))))(
    "observes a concurrent limit $change after the owner lock is released ($mode)",
    async ({ mode, change }) => {
      const writer = new pg.Client({ connectionString: env.HYPERDRIVE.connectionString });
      await writer.connect();
      let pending: Promise<unknown> | undefined;
      try {
        if (change === "decrease") await admin.query("UPDATE users SET max_video_upload_size_mb = 2");
        await writer.query("BEGIN");
        await writer.query("SELECT id FROM users WHERE id = 'owner' FOR UPDATE");
        pending = upload(mode, 2 * MIB).catch(error => error);
        await vi.waitFor(async () => {
          const blocked = await admin.query("SELECT 1 FROM pg_stat_activity WHERE application_name = $1 AND cardinality(pg_blocking_pids(pid)) > 0", [schema]);
          expect(blocked.rowCount).toBe(1);
        });
        await writer.query("UPDATE users SET max_video_upload_size_mb = $1 WHERE id = 'owner'", [change === "decrease" ? 1 : 2]);
        await writer.query("COMMIT");
        const result = await pending;
        if (change === "decrease") {
          expectTooLarge(result, mode);
          await expectNoReservation();
        } else {
          expect(result).toMatchObject({ video: { id: 1 } });
          expect((await admin.query("SELECT used_storage_bytes FROM users")).rows).toEqual([{ used_storage_bytes: String(2 * MIB) }]);
        }
      } finally {
        await writer.query("ROLLBACK");
        await pending;
        await writer.end();
      }
    },
  );

  it("keeps concurrent idempotent retries to one reservation and video", async () => {
    const idempotency: CreationIdempotency = { action: "request_video_upload", key: "same-upload", requestHash: "a".repeat(64) };
    const results = await Promise.all(Array.from({ length: 6 }, () => upload("presigned", MIB, idempotency)));
    expect(results.every(result => "video" in result && result.video?.id === 1)).toBe(true);
    expect(results.filter(result => "reused" in result && result.reused)).toHaveLength(5);
    expect((await admin.query("SELECT used_storage_bytes FROM users")).rows).toEqual([{ used_storage_bytes: String(MIB) }]);
    expect((await admin.query("SELECT * FROM videos")).rows).toHaveLength(1);
    expect((await admin.query("SELECT * FROM mcp_idempotency_records")).rows).toHaveLength(1);

    vi.mocked(media.presignR2Put).mockClear();
    expect(await upload("presigned", MIB, { ...idempotency, requestHash: "b".repeat(64) }))
      .toEqual({ idempotencyConflict: true });
    await admin.query("UPDATE users SET max_video_upload_size_mb = 0");
    expectTooLarge(await upload("presigned", MIB, idempotency), "presigned", 0);
    expect(media.presignR2Put).not.toHaveBeenCalled();
    expect((await admin.query("SELECT used_storage_bytes FROM users")).rows).toEqual([{ used_storage_bytes: String(MIB) }]);
  });

  it("enforces the limit for direct repository callers", async () => {
    expect(await reserveAndCreatePendingVideo(env, "owner", MIB + 1, "videos/owner/clip.mp4", "Clip", ""))
      .toEqual({ fileTooLarge: true, maxMb: 1 });
    await expectNoReservation();
  });

  it("reports a missing owner without creating orphan reservations", async () => {
    await admin.query("DELETE FROM users");
    await expect(reserveAndCreatePendingVideo(env, "owner", 1, "videos/owner/clip.mp4", "Clip", ""))
      .rejects.toThrow("Quota owner not found");
    expect((await admin.query("SELECT * FROM videos")).rows).toEqual([]);
  });
});
