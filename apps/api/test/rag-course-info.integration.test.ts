import pg from "pg";
import { PGVectorStore } from "@yukiharada1228/langchain-postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getCourseWithMembers } from "../src/repositories/chat-repository";
import { courseInfoTool } from "../src/lib/rag-course-info";
import { openSceneSearch } from "../src/repositories/vector-repository";
import type { Bindings } from "../src/types/bindings";

vi.mock("../src/lib/embeddings", () => ({ embedQuery: vi.fn(async () => [1, 0]) }));

const databaseUrl = process.env.QUOTA_TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres("course metadata and scene selection on PostgreSQL without PLOG", () => {
  const schemaName = `rag_metadata_${crypto.randomUUID().replaceAll("-", "")}`;
  const quotedSchema = `"${schemaName}"`;
  let admin: pg.Client;
  let env: Bindings;
  let schemaCreated = false;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: databaseUrl });
    await admin.connect();
    await admin.query("CREATE EXTENSION IF NOT EXISTS vector");
    await admin.query(`CREATE SCHEMA ${quotedSchema}`);
    schemaCreated = true;
    await admin.query(`SET search_path TO ${quotedSchema}, public`);
    await admin.query(`
      CREATE TABLE video_courses (
        id integer PRIMARY KEY, user_id text NOT NULL, name text NOT NULL, description text NOT NULL DEFAULT '',
        display_order integer NOT NULL DEFAULT 0, share_slug text,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE videos (
        id integer PRIMARY KEY, user_id text NOT NULL, file text NOT NULL DEFAULT 'private.mp4',
        title text NOT NULL, description text NOT NULL DEFAULT '',
        uploaded_at timestamptz NOT NULL DEFAULT now(), status text NOT NULL DEFAULT 'completed',
        source_type text NOT NULL DEFAULT 'uploaded', source_url text NOT NULL DEFAULT '',
        youtube_video_id text NOT NULL DEFAULT ''
      );
      CREATE TABLE video_course_members (
        id integer PRIMARY KEY, course_id integer NOT NULL, video_id integer NOT NULL,
        "order" integer NOT NULL DEFAULT 0, added_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE video_course_memberships (course_id integer NOT NULL, user_id text NOT NULL);
      CREATE TABLE tags (id integer PRIMARY KEY, name text, color text);
      CREATE TABLE video_tags (video_id integer, tag_id integer);
      CREATE TABLE scene_embeddings (
        langchain_id uuid PRIMARY KEY, content text NOT NULL, embedding vector(2),
        user_id text NOT NULL, video_id bigint NOT NULL, langchain_metadata json NOT NULL
      );
      INSERT INTO video_courses (id, user_id, name, description, share_slug) VALUES
        (3, 'owner', 'Digital circuits', 'Registered course description', 'public-course'),
        (4, 'outsider', 'Private course', '', NULL),
        (5, 'owner', 'Empty course', '', NULL);
      INSERT INTO videos (id, user_id, title, description, status) VALUES
        (60, 'owner', 'Lecture 7', 'First listed video', 'completed'),
        (61, 'owner', 'Lecture 8', '', 'processing'),
        (62, 'owner', 'Other course video', '', 'completed'),
        (99, 'outsider', 'Private video', '', 'completed');
      INSERT INTO video_course_members (id, course_id, video_id, "order", added_at) VALUES
        (1, 3, 60, 10, '2026-09-14'), (2, 3, 61, 10, '2026-09-14'),
        (3, 4, 99, 0, '2026-09-14');
      INSERT INTO video_course_memberships VALUES (3, 'member');
      INSERT INTO scene_embeddings VALUES
        ('00000000-0000-4000-8000-000000000060', 'allowed scene', '[1,0]', 'owner', 60,
         '{"video_title":"Lecture 7","start_time":"00:00:00","end_time":"00:00:10"}'),
        ('00000000-0000-4000-8000-000000000061', 'selected scene', '[0.9,0.1]', 'owner', 61,
         '{"video_title":"Lecture 8","start_time":"00:00:10","end_time":"00:00:20"}'),
        ('00000000-0000-4000-8000-000000000062', 'same owner other course', '[1,0]', 'owner', 62, '{}'),
        ('00000000-0000-4000-8000-000000000099', 'foreign owner', '[1,0]', 'outsider', 60, '{}');
    `);
    const scopedUrl = new URL(databaseUrl!);
    scopedUrl.searchParams.set("options", `-c search_path=${schemaName},public`);
    env = { HYPERDRIVE: { connectionString: scopedUrl.toString() } } as Bindings;
  });

  afterAll(async () => {
    try { if (schemaCreated) await admin.query(`DROP SCHEMA ${quotedSchema} CASCADE`); }
    finally { await admin?.end(); }
  });

  it.each([{ userId: "owner" }, { userId: "member" }, { shareToken: "public-course" }])
    ("uses the authorized course for %j with stable pagination and compact evidence", async (access) => {
      const scope = await getCourseWithMembers(env, { courseId: 3, ...access });
      expect(scope).toMatchObject({ id: 3, userId: "owner", memberVideoIds: [60, 61] });
      const contexts: string[] = [];
      const tool = courseInfoTool(env, { courseId: scope!.id, ownerUserId: scope!.userId }, (s) => contexts.push(s));
      const first = JSON.parse(await tool.invoke({ video_limit: 1, video_offset: 0 }));
      const second = JSON.parse(await tool.invoke({ video_limit: 1, video_offset: first.videos_meta.next_offset }));
      expect(first).toMatchObject({ name: "Digital circuits", video_count: 2,
        videos: [{ id: 60, title: "Lecture 7", position: 1, order: 10 }],
        videos_meta: { total: 2, has_more: true, next_offset: 1 },
      });
      expect(second).toMatchObject({ videos: [{ id: 61, position: 2, order: 10, description: "", status: "processing" }],
        videos_meta: { total: 2, has_more: false, next_offset: null },
      });
      const beyond = JSON.parse(await tool.invoke({ video_limit: 1, video_offset: 20 }));
      expect(beyond).toMatchObject({ videos: [], video_count: 2, videos_meta: { has_more: false, next_offset: null } });
      for (const forbidden of ["private.mp4", "public-course", "user_id", "share_slug", "Private video", "Other course video"]) {
        expect(contexts.join("\n")).not.toContain(forbidden);
      }
    });

  it.each([
    { courseId: 3, userId: "outsider" },
    { courseId: 4, userId: "member" },
    { courseId: 4, shareToken: "public-course" },
  ])("denies access to the course for %j before constructing tools", async (access) => {
    expect(await getCourseWithMembers(env, access)).toBeNull();
  });

  it("retrieves a course with no videos, description, embeddings or PLOG", async () => {
    const tool = courseInfoTool(env, { courseId: 5, ownerUserId: "owner" }, () => {});
    expect(JSON.parse(await tool.invoke({}))).toMatchObject({
      name: "Empty course", description: "", video_count: 0, videos: [],
      videos_meta: { total: 0, has_more: false, next_offset: null },
    });
  });

  it("intersects selection with the fixed course/owner scope and preserves default whole-course search", async () => {
    // SDK の既定スキーマは public。SQL・検索は実物のまま、一時スキーマへ接続先を固定する。
    const initialize = PGVectorStore.initialize;
    const initializeSpy = vi.spyOn(PGVectorStore, "initialize").mockImplementation(
      (engine, embeddings, table, options) => initialize(engine, embeddings, table, { ...options, schemaName }),
    );
    const search = await openSceneSearch(env, { userId: "owner", videoIds: [60, 61] });
    try {
      expect((await search.search("scene")).map((hit) => hit.content)).toEqual(["allowed scene", "selected scene"]);
      expect((await search.search("scene", undefined, [61])).map((hit) => hit.content)).toEqual(["selected scene"]);
      expect((await search.search("scene", undefined, [60, 60])).map((hit) => hit.content)).toEqual(["allowed scene"]);
      for (const ids of [[], [62], [99], [60, 99]]) {
        await expect(search.search("scene", undefined, ids)).rejects.toThrow("subset");
      }
    } finally {
      await search.close();
      initializeSpy.mockRestore();
    }
  });
});
