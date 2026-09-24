import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { attachTags } from "../src/repositories/membership-repository";
import { addTagsToVideo, removeTagFromVideo } from "../src/features/membership/service";
import type { Bindings } from "../src/types/bindings";

const databaseUrl = process.env.QUOTA_TEST_DATABASE_URL;

(databaseUrl ? describe : describe.skip)("tag attachment on PostgreSQL", () => {
  const schema = `tag_attachment_${crypto.randomUUID().replaceAll("-", "")}`;
  let admin: pg.Client;
  let env: Bindings;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: databaseUrl });
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`SET search_path TO "${schema}"`);
    await admin.query(`
      CREATE TABLE videos (id bigint PRIMARY KEY, user_id text NOT NULL);
      CREATE TABLE tags (id bigint PRIMARY KEY, user_id text NOT NULL);
      CREATE TABLE video_tags (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        video_id bigint NOT NULL REFERENCES videos ON DELETE CASCADE,
        tag_id bigint NOT NULL REFERENCES tags ON DELETE CASCADE,
        added_at timestamptz NOT NULL,
        UNIQUE(tag_id, video_id)
      );
      INSERT INTO videos VALUES (10, 'owner'), (20, 'outsider');
      INSERT INTO tags VALUES (1, 'owner'), (2, 'owner'), (3, 'outsider'), (4, 'owner');
    `);
    const url = new URL(databaseUrl!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    url.searchParams.set("application_name", schema);
    env = { HYPERDRIVE: { connectionString: url.toString() } } as Bindings;
  });
  beforeEach(async () => {
    await admin.query(`TRUNCATE video_tags, videos, tags;
      INSERT INTO videos VALUES (10, 'owner'), (20, 'outsider');
      INSERT INTO tags VALUES (1, 'owner'), (2, 'owner'), (3, 'outsider'), (4, 'owner');
      INSERT INTO video_tags (video_id, tag_id, added_at) VALUES (10, 1, now())`);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await admin.end(); }
  });

  it("inserts only missing tags in one connection and preserves existing rows", async () => {
    const before = (await admin.query("SELECT * FROM video_tags")).rows[0];
    const connect = vi.spyOn(pg.Client.prototype, "connect");
    await expect(attachTags(env, 10, "owner", [1, 2])).resolves.toEqual({ added: 1 });
    expect(connect).toHaveBeenCalledTimes(1);
    connect.mockRestore();
    const rows = (await admin.query("SELECT * FROM video_tags ORDER BY tag_id")).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(before);
    await expect(attachTags(env, 10, "owner", [1, 2])).resolves.toEqual({ added: 0 });
  });

  it("counts duplicate inputs and concurrent requests exactly once", async () => {
    const results = await Promise.all([
      addTagsToVideo(env, "owner", 10, [1, 2, 2]),
      addTagsToVideo(env, "owner", 10, [1, 2, 2]),
    ]);
    expect(results.reduce((sum, result) => sum + ("added_count" in result ? result.added_count : 0), 0)).toBe(1);
    expect(results.reduce((sum, result) => sum + ("skipped_count" in result ? result.skipped_count : 0), 0)).toBe(5);
    expect((await admin.query("SELECT tag_id FROM video_tags ORDER BY tag_id")).rows).toEqual([
      { tag_id: "1" }, { tag_id: "2" },
    ]);
  });

  it("observes concurrent additions after acquiring the video lock", async () => {
    const writer = new pg.Client({ connectionString: env.HYPERDRIVE.connectionString, application_name: `${schema}_holder` });
    await writer.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await writer.query("BEGIN");
      await writer.query("SET LOCAL lock_timeout = '500ms'");
      await writer.query("INSERT INTO video_tags (video_id, tag_id, added_at) VALUES (10, 2, now())");
      pending = attachTags(env, 10, "owner", [4, 2]).catch(error => error);
      // An uncommitted insertion holds the referenced video row's key-share lock.
      await vi.waitFor(async () => {
        const waiting = await admin.query(
          "SELECT 1 FROM pg_stat_activity WHERE application_name = $1 AND wait_event_type = 'Lock'",
          [schema],
        );
        expect(waiting.rowCount).toBe(1);
      });
      await writer.query("INSERT INTO video_tags (video_id, tag_id, added_at) VALUES (10, 4, now())");
      await writer.query("COMMIT");
      await expect(pending).resolves.toEqual({ added: 0 });
    } finally {
      await writer.query("ROLLBACK");
      await pending;
      await writer.end();
    }
  });

  it.each([
    ["outsider", 10, 2, "Video not found"],
    ["owner", 20, 2, "Video not found"],
    ["owner", 99, 2, "Video not found"],
    ["owner", 10, 3, "Resource not found"],
    ["owner", 10, 99, "Resource not found"],
  ] as const)("retains ownership checks for %s / %i / %i", async (user, video, tag, message) => {
    await expect(addTagsToVideo(env, user, video, [tag])).resolves.toEqual({ notFound: message });
    expect((await admin.query("SELECT tag_id FROM video_tags")).rows).toEqual([{ tag_id: "1" }]);
  });

  it("does not insert any tags when one requested tag is missing", async () => {
    await expect(attachTags(env, 10, "owner", [2, 99])).resolves.toEqual({ notFound: "Resource not found" });
    expect((await admin.query("SELECT tag_id FROM video_tags")).rows).toEqual([{ tag_id: "1" }]);
  });

  it("checks the owner for an empty batch without querying tags", async () => {
    const connect = vi.spyOn(pg.Client.prototype, "connect");
    const query = vi.spyOn(pg.Client.prototype, "query");
    await expect(attachTags(env, 10, "owner", [])).resolves.toEqual({ added: 0 });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.some(([input]) => /tags/.test(typeof input === "string" ? input : input.text))).toBe(false);
  });

  it.each(["attach", "detach"])("uses one connection for %s including ownership checks", async action => {
    const connect = vi.spyOn(pg.Client.prototype, "connect");
    if (action === "attach") {
      expect(await addTagsToVideo(env, "owner", 10, [1, 2, 2])).toMatchObject({ added_count: 1, skipped_count: 2 });
    } else {
      expect(await removeTagFromVideo(env, "owner", 10, 1)).toHaveProperty("ok", true);
    }
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("preserves already attached tags even if their owner changed", async () => {
    await admin.query("UPDATE tags SET user_id = 'outsider' WHERE id = 1");
    const existing = (await admin.query("SELECT * FROM video_tags")).rows[0];
    expect(await addTagsToVideo(env, "owner", 10, [1, 1, 2])).toMatchObject({ added_count: 1, skipped_count: 2 });
    expect((await admin.query("SELECT * FROM video_tags WHERE tag_id = 1")).rows[0]).toEqual(existing);
  });

  it("rejects an entire batch if one new tag is foreign", async () => {
    expect(await addTagsToVideo(env, "owner", 10, [2, 3, 4])).toEqual({ notFound: "Resource not found" });
    expect((await admin.query("SELECT tag_id FROM video_tags")).rows).toEqual([{ tag_id: "1" }]);
  });

  it.each([{ ids: [] }, { ids: [1, 1] }])("keeps video authorization for a no-op request %j", async ({ ids }) => {
    expect(await addTagsToVideo(env, "outsider", 10, ids)).toEqual({ notFound: "Video not found" });
    expect(await addTagsToVideo(env, "owner", 10, ids)).toMatchObject({ added_count: 0, skipped_count: ids.length });
  });

  it.each([
    ["attach", "videos", "transfer"], ["attach", "videos", "delete"],
    ["attach", "tags", "transfer"], ["attach", "tags", "delete"],
    ["detach", "videos", "transfer"], ["detach", "videos", "delete"],
    ["detach", "tags", "transfer"], ["detach", "tags", "delete"],
  ] as const)("rechecks permissions after a concurrent %s / %s / %s", async (action, table, change) => {
    const id = table === "videos" ? 10 : action === "attach" ? 2 : 1;
    const writer = new pg.Client({ connectionString: env.HYPERDRIVE.connectionString, application_name: `${schema}_holder` });
    await writer.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await writer.query("BEGIN");
      await writer.query(`SELECT id FROM ${table} WHERE id = $1 FOR UPDATE`, [id]);
      // Lock the link as well so the old unchecked DELETE cannot finish before the change.
      if (action === "detach") await writer.query("SELECT id FROM video_tags WHERE video_id = 10 AND tag_id = 1 FOR UPDATE");
      pending = (action === "attach"
        ? addTagsToVideo(env, "owner", 10, [2])
        : removeTagFromVideo(env, "owner", 10, 1)).catch(error => error);
      await vi.waitFor(async () => {
        expect((await admin.query("SELECT 1 FROM pg_stat_activity WHERE application_name = $1 AND cardinality(pg_blocking_pids(pid)) > 0", [schema])).rowCount).toBe(1);
      });
      await writer.query(change === "transfer"
        ? `UPDATE ${table} SET user_id = 'outsider' WHERE id = $1`
        : `DELETE FROM ${table} WHERE id = $1`, [id]);
      await writer.query("COMMIT");
      expect(await pending).toEqual({ notFound: table === "videos" ? "Video not found" : action === "attach" ? "Resource not found" : "Tag not found" });
      if (change === "transfer") {
        expect((await admin.query("SELECT tag_id FROM video_tags")).rows).toEqual([{ tag_id: "1" }]);
      }
    } finally {
      await writer.query("ROLLBACK");
      await pending;
      await writer.end();
    }
  });

  it("rolls back a partial batch when persistence fails", async () => {
    await admin.query(`CREATE FUNCTION reject_tag_four() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.tag_id = 4 THEN RAISE EXCEPTION 'cannot attach tag'; END IF; RETURN NEW; END;
      $$; CREATE TRIGGER reject_tag_four BEFORE INSERT ON video_tags FOR EACH ROW EXECUTE FUNCTION reject_tag_four()`);
    try {
      await expect(addTagsToVideo(env, "owner", 10, [2, 4])).rejects.toThrow();
      expect((await admin.query("SELECT tag_id FROM video_tags")).rows).toEqual([{ tag_id: "1" }]);
    } finally {
      await admin.query("DROP TRIGGER reject_tag_four ON video_tags; DROP FUNCTION reject_tag_four()");
    }
  });
});
