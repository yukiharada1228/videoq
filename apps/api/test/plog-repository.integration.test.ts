import { readFileSync } from "node:fs";
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createConcept, createEdge, deleteConcept, getPlogGraph, listReadyGraphs, mergeConcepts, PlogConflictError, PlogEditError, updateConcept, updateEdge } from "../src/repositories/plog-repository";
import type { Bindings } from "../src/types/bindings";
import { editMergeConcepts } from "../src/features/plog/service";
import { nextHint } from "../src/lib/plog-runtime";

const databaseUrl = process.env.QUOTA_TEST_DATABASE_URL;
const fixture = readFileSync(new URL("./fixtures/video-deletion.sql", import.meta.url), "utf8");
const tables = ["videos", "plog_concepts", "plog_edges", "plog_learning_objects", "learner_concept_states", "plog_summary_nodes"];

(databaseUrl ? describe : describe.skip)("PLOG repository on PostgreSQL", () => {
  const schema = `plog_deletion_${crypto.randomUUID().replaceAll("-", "")}`;
  let admin: pg.Client;
  let env: Bindings;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: databaseUrl });
    await admin.connect();
    const url = new URL(databaseUrl!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    env = { HYPERDRIVE: { connectionString: url.toString() } } as Bindings;
  });
  beforeEach(async () => {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`SET search_path TO "${schema}"`);
    await admin.query(fixture);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await admin.end(); }
  });

  async function snapshot() {
    const rows: Record<string, unknown[]> = {};
    for (const table of tables) rows[table] = (await admin.query(`SELECT * FROM ${table} ORDER BY id`)).rows;
    return rows;
  }

  async function rejectConceptDeletion() {
    await admin.query(`
      CREATE FUNCTION reject_delete() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'delete rejected'; END $$;
      CREATE TRIGGER reject_delete BEFORE DELETE ON plog_concepts FOR EACH ROW EXECUTE FUNCTION reject_delete();
    `);
  }

  const writes = [
    { name: "create concept", table: "plog_concepts", message: "A concept with this label already exists.",
      run: (conflict: boolean) => createConcept(env, {
        videoId: 10, label: conflict ? "Existing" : "A unique label", nodeType: "object",
        introSec: 0, sourceQuote: "", embedding: [],
      }) },
    { name: "update concept", table: "plog_concepts", message: "A concept with this label already exists.",
      run: (conflict: boolean) => updateConcept(env, {
        videoId: 10, conceptId: 3, label: conflict ? "Existing" : "A unique label",
        embedding: [],
      }) },
    { name: "create edge", table: "plog_edges", message: "This edge already exists.",
      run: (conflict: boolean) => createEdge(env, {
        videoId: 10, sourceId: 1, targetId: 3,
        edgeType: conflict ? "example_of" : "analogy_for", quote: conflict ? "" : "A unique quote",
      }) },
    { name: "update edge", table: "plog_edges", message: "This edge already exists.",
      run: (conflict: boolean) => updateEdge(env, {
        videoId: 10, edgeId: 4,
        ...(conflict ? { sourceId: 1, targetId: 3 } : { quote: "A unique quote" }),
      }) },
  ];

  async function seedWrites() {
    await admin.query(`
      UPDATE plog_concepts SET label = 'Existing' WHERE id = 1;
      INSERT INTO plog_concepts (id, video_id, label) VALUES (3, 10, 'Another');
      DELETE FROM plog_edges WHERE video_id = 10;
      INSERT INTO plog_edges (id, video_id, source_id, target_id, edge_type) VALUES
        (3, 10, 1, 3, 'example_of'), (4, 10, 3, 1, 'example_of');
    `);
  }

  it.each(writes)("reports a real unique violation for $name and preserves the graph", async operation => {
    await seedWrites();
    const before = await snapshot();
    await expect(operation.run(true)).rejects.toThrow(new PlogConflictError(operation.message));
    expect(await snapshot()).toEqual(before);
  });

  it.each(writes)("does not treat user text containing unique as a conflict for $name", async operation => {
    await seedWrites();
    await admin.query(`
      CREATE FUNCTION reject_write() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'write rejected'; END $$;
      CREATE TRIGGER reject_write BEFORE INSERT OR UPDATE ON ${operation.table} FOR EACH ROW EXECUTE FUNCTION reject_write();
    `);
    const before = await snapshot();
    await expect(operation.run(false)).rejects.not.toBeInstanceOf(PlogConflictError);
    expect(await snapshot()).toEqual(before);
  });

  it("deletes only the requested concept and cascades its children without preliminary reads/deletes", async () => {
    const before = await snapshot();
    const query = vi.spyOn(pg.Client.prototype, "query");
    await expect(deleteConcept(env, 1, 10)).resolves.toBe(true);
    // BEGIN, graph lock, active-build guard, DELETE RETURNING, COMMIT.
    expect(query).toHaveBeenCalledTimes(5);
    query.mockRestore();
    const after = await snapshot();
    for (const table of ["plog_concepts", "plog_edges", "plog_learning_objects", "learner_concept_states"]) {
      expect(after[table]).toEqual(before[table].filter(row => (row as { id: number }).id === 2));
    }
    expect(after.videos).toEqual(before.videos);
    expect(after.plog_summary_nodes).toEqual(before.plog_summary_nodes);
  });

  it.each([2, 99])("preserves the graph when concept %i is outside the video or missing", async conceptId => {
    const before = await snapshot();
    await expect(deleteConcept(env, conceptId, 10)).resolves.toBe(false);
    expect(await snapshot()).toEqual(before);
  });

  it.each(["pending", "running"])("keeps the graph locked against editing during a %s rebuild", async status => {
    await admin.query("UPDATE plog_build_jobs SET status = $1 WHERE video_id = 10", [status]);
    const before = await snapshot();
    await expect(deleteConcept(env, 1, 10)).rejects.toBeInstanceOf(PlogEditError);
    expect(await snapshot()).toEqual(before);
  });

  it("rolls back all child deletion when concept deletion fails", async () => {
    await rejectConceptDeletion();
    const before = await snapshot();
    await expect(deleteConcept(env, 1, 10)).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });

  async function seedMerge() {
    await admin.query(`
      INSERT INTO plog_concepts (id, video_id, label) VALUES (3, 10, 'absorbed'), (4, 10, 'neighbor A'), (5, 10, 'neighbor B');
      DELETE FROM plog_edges WHERE id = 1;
      INSERT INTO plog_edges (id, video_id, source_id, target_id) VALUES
        (10, 10, 1, 4), (11, 10, 3, 4), (12, 10, 4, 3), (13, 10, 3, 5),
        (14, 10, 3, 1), (15, 10, 1, 3), (16, 10, 5, 1), (17, 10, 5, 3);
      UPDATE plog_edges SET edge_type = 'analogy_for' WHERE video_id = 10;
      UPDATE plog_learning_objects SET hint_ladder = '["shared"]' WHERE concept_id = 1;
      INSERT INTO plog_learning_objects (id, concept_id, opening_question, hint_ladder, waypoints)
        VALUES (3, 3, 'Opening question', '["shared", "absorbed hint"]', '[{"start_sec":3}]');
      UPDATE learner_concept_states SET hint_index = 1, last_grade = 'pass' WHERE id = 1;
      INSERT INTO learner_concept_states (id, concept_id, user_id, reached, hint_index, last_grade, active) VALUES
        (3, 3, 'owner', true, 3, 'retry', true), (4, 3, 'guest', false, 2, '', false),
        (5, 1, 'survivor_only', true, 1, '', false);
    `);
  }

  it("preserves merged learning material, learner progress and rewired edges before cascading the absorbed concept", async () => {
    await seedMerge();
    const before = await snapshot();
    const query = vi.spyOn(pg.Client.prototype, "query");
    await expect(mergeConcepts(env, 10, 1, 3)).resolves.toMatchObject({
      id: 1, opening_question: "Opening question", hint_ladder: ["shared", "absorbed hint"],
      waypoints: [{ start_sec: 3 }],
    });
    const statements = query.mock.calls.map(([q]) => (typeof q === "string" ? q : q.text).replaceAll('"', "").toLowerCase());
    expect(statements.some(q => /delete from (learner_concept_states|plog_learning_objects)/.test(q))).toBe(false);
    query.mockRestore();
    const after = await snapshot();
    for (const table of ["plog_concepts", "plog_edges", "plog_learning_objects", "learner_concept_states"]) {
      expect(after[table]).toContainEqual(before[table].find(row => (row as { id: number }).id === 2));
      expect(after[table].some(row => (row as { id: number }).id === 3)).toBe(false);
    }
    expect((await admin.query("SELECT source_id, target_id FROM plog_edges WHERE video_id = 10 ORDER BY id")).rows)
      .toEqual([{ source_id: 1, target_id: 4 }, { source_id: 4, target_id: 1 }, { source_id: 1, target_id: 5 }, { source_id: 5, target_id: 1 }]);
    expect((await admin.query("SELECT user_id, concept_id, reached, hint_index, last_grade, active FROM learner_concept_states WHERE concept_id = 1 ORDER BY user_id")).rows)
      .toEqual([
        { user_id: "guest", concept_id: 1, reached: false, hint_index: 2, last_grade: "", active: false },
        { user_id: "owner", concept_id: 1, reached: true, hint_index: 3, last_grade: "pass", active: true },
        { user_id: "survivor_only", concept_id: 1, reached: true, hint_index: 1, last_grade: "", active: false },
      ]);
    expect(after.videos).toEqual(before.videos);
    expect(after.plog_summary_nodes).toEqual(before.plog_summary_nodes);
  });

  it("rolls back material, progress and edge changes if the absorbed concept cannot be deleted", async () => {
    await seedMerge();
    await rejectConceptDeletion();
    const before = await snapshot();
    await expect(mergeConcepts(env, 10, 1, 3)).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });

  it.each([0, 50])("merges %i extra edges and learners without per-row queries or preliminary connections", async extraRows => {
    await seedMerge();
    await admin.query(`
      INSERT INTO plog_concepts (id, video_id, label)
        SELECT 1000 + n, 10, 'Neighbor ' || n FROM generate_series(1, $1::int) n;
      `, [extraRows]);
    await admin.query(`
      INSERT INTO plog_edges (video_id, source_id, target_id, edge_type)
        SELECT 10, 3, 1000 + n, 'example_of' FROM generate_series(1, $1::int) n;
      `, [extraRows]);
    await admin.query(`
      INSERT INTO learner_concept_states (concept_id, user_id, reached, hint_index)
        SELECT 3, 'learner ' || n, true, 2 FROM generate_series(1, $1::int) n;
      `, [extraRows]);
    const query = vi.spyOn(pg.Client.prototype, "query");
    const connect = vi.spyOn(pg.Client.prototype, "connect");
    await expect(editMergeConcepts(env, 10, 1, 3)).resolves.toMatchObject({ ok: true, value: { id: 1 } });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(query.mock.calls.length).toBeLessThanOrEqual(15);
    vi.restoreAllMocks();
    expect((await admin.query("SELECT count(*)::int AS n FROM plog_edges WHERE source_id = 1 AND target_id >= 1000")).rows[0].n).toBe(extraRows);
    expect((await admin.query("SELECT count(*)::int AS n FROM learner_concept_states WHERE concept_id = 1 AND user_id LIKE 'learner %' AND reached AND hint_index = 2")).rows[0].n).toBe(extraRows);
  });

  it.each(["prerequisite_of", "builds_on", "presentation_order"])("rejects a merge that introduces a %s cycle without changing the graph", async edgeType => {
    await seedMerge();
    await admin.query("DELETE FROM plog_edges WHERE video_id = 10");
    await admin.query(`INSERT INTO plog_edges (video_id, source_id, target_id, edge_type) VALUES
      (10, 1, 4, $1), (10, 4, 3, $1)`, [edgeType]);
    const before = await snapshot();
    await expect(editMergeConcepts(env, 10, 1, 3)).resolves.toEqual({
      ok: false, status: 400, message: "Ordering edges must form a DAG (cycle detected).",
    });
    expect(await snapshot()).toEqual(before);
  });

  it("removes collapsed ordering edges while preserving existing edge identity and quotes", async () => {
    await seedMerge();
    await admin.query("DELETE FROM plog_edges WHERE video_id = 10");
    await admin.query(`INSERT INTO plog_edges (id, video_id, source_id, target_id, edge_type, quote) VALUES
      (10, 10, 1, 3, 'prerequisite_of', 'collapsed'),
      (11, 10, 1, 4, 'prerequisite_of', 'keep original'),
      (12, 10, 3, 4, 'prerequisite_of', 'discard duplicate'),
      (13, 10, 3, 5, 'builds_on', 'keep moved');`);
    await expect(editMergeConcepts(env, 10, 1, 3)).resolves.toMatchObject({ ok: true });
    expect((await admin.query("SELECT id, source_id, target_id, quote, validation_status FROM plog_edges WHERE video_id = 10 ORDER BY id")).rows).toEqual([
      { id: 11, source_id: 1, target_id: 4, quote: "keep original", validation_status: "generated" },
      { id: 13, source_id: 1, target_id: 5, quote: "keep moved", validation_status: "edited" },
    ]);
    expect((await admin.query("SELECT id, user_id FROM learner_concept_states WHERE concept_id = 1 ORDER BY id")).rows).toEqual([
      { id: 1, user_id: "owner" }, { id: 4, user_id: "guest" }, { id: 5, user_id: "survivor_only" },
    ]);
  });

  it.each([[1, 2], [1, 99], [99, 1], [1, 1]])("preserves all data for invalid merge %i ← %i", async (survivor, absorb) => {
    const before = await snapshot();
    const result = await editMergeConcepts(env, 10, survivor, absorb);
    expect(result).toMatchObject({ ok: false, status: survivor === absorb ? 400 : 404 });
    expect(await snapshot()).toEqual(before);
  });

  it("serializes concurrent merges and rejects the one that would close an ordering cycle", async () => {
    await seedMerge();
    await admin.query("DELETE FROM plog_edges WHERE video_id = 10");
    await admin.query(`INSERT INTO plog_edges (video_id, source_id, target_id, edge_type) VALUES
      (10, 1, 4, 'prerequisite_of'), (10, 5, 3, 'presentation_order')`);
    const results = await Promise.all([
      editMergeConcepts(env, 10, 1, 3), editMergeConcepts(env, 10, 4, 5),
    ]);
    expect(results.filter(result => result.ok)).toHaveLength(1);
    expect(results.filter(result => !result.ok)).toEqual([
      { ok: false, status: 400, message: "Ordering edges must form a DAG (cycle detected)." },
    ]);
    expect((await admin.query("SELECT id FROM plog_concepts WHERE video_id = 10")).rows).toHaveLength(3);
  });

  it.each(["survivor", "absorbed", "both"])("merges when %s learning material is missing", async missing => {
    await seedMerge();
    await admin.query("DELETE FROM plog_learning_objects WHERE concept_id = ANY($1::int[])", [
      missing === "both" ? [1, 3] : [missing === "survivor" ? 1 : 3],
    ]);
    await expect(mergeConcepts(env, 10, 1, 3)).resolves.toMatchObject({
      id: 1,
      opening_question: missing === "survivor" ? "Opening question" : "",
      hint_ladder: missing === "survivor" ? ["shared", "absorbed hint"] : missing === "absorbed" ? ["shared"] : [],
    });
    expect((await admin.query("SELECT concept_id FROM plog_learning_objects ORDER BY concept_id")).rows).toEqual([
      { concept_id: 1 }, { concept_id: 2 },
    ]);
  });

  it("keeps stable material order, semantic duplicates, and learner progress during a bulk merge", async () => {
    await seedMerge();
    await admin.query(`
      UPDATE plog_learning_objects SET opening_question = 'Keep this question',
        misconceptions = '["first", "shared"]', canonical_order = '["a", "b"]',
        worked_examples = '["example"]', waypoints = '[{"start_sec":3,"label":"same"}]'
        WHERE concept_id = 1;
      UPDATE plog_learning_objects SET misconceptions = '["shared", "last"]',
        canonical_order = '["b", "c"]', worked_examples = '["example", "new"]',
        waypoints = '[{"label":"same","start_sec":3},{"start_sec":5}]'
        WHERE concept_id = 3;
      UPDATE learner_concept_states SET reached = true, hint_index = 5, last_grade = '', active = false WHERE id = 1;
    `);
    await expect(mergeConcepts(env, 10, 1, 3)).resolves.toMatchObject({
      opening_question: "Keep this question", misconceptions: ["first", "shared", "last"],
      canonical_order: ["a", "b", "c"], worked_examples: ["example", "new"],
      waypoints: [{ start_sec: 3, label: "same" }, { start_sec: 5 }],
    });
    expect((await admin.query("SELECT id, reached, hint_index, last_grade, active FROM learner_concept_states WHERE user_id = 'owner' AND concept_id = 1")).rows).toEqual([
      { id: 1, reached: true, hint_index: 5, last_grade: "retry", active: true },
    ]);
  });

  it.each(["pending", "running"])("reports an edit error and preserves data during a %s build", async status => {
    await seedMerge();
    await admin.query("UPDATE plog_build_jobs SET status = $1 WHERE video_id = 10", [status]);
    const before = await snapshot();
    await expect(editMergeConcepts(env, 10, 1, 3)).resolves.toEqual({
      ok: false, status: 400, message: "Cannot edit graph while a rebuild is in progress.",
    });
    expect(await snapshot()).toEqual(before);
  });

  it("loads ready graphs in four queries, preserving input and per-video artifact order", async () => {
    await admin.query(`
      INSERT INTO videos (id, user_id) VALUES (30, 'owner'), (40, 'owner'), (50, 'owner'), (70, 'owner');
      INSERT INTO plog_build_jobs (id, video_id, status, created_at) VALUES
        (3, 30, 'ready', '2026-01-01'), (4, 30, 'running', '2026-01-02'),
        (5, 40, 'failed', '2026-01-02'), (6, 50, 'ready', '2026-01-02'), (7, 70, 'ready', '2026-01-02');
      INSERT INTO plog_concepts (id, video_id, label, intro_sec) VALUES
        (3, 10, 'middle', 4), (4, 10, 'first', 1), (5, 50, 'out of scope', 0);
      UPDATE plog_concepts SET intro_sec = 6 WHERE id = 1;
      UPDATE plog_concepts SET embedding = '[1]' WHERE video_id = 50;
      UPDATE plog_learning_objects SET opening_question = 'Question', hint_ladder = '["hint"]',
        waypoints = '[{"start_sec":1,"end_sec":2}]' WHERE concept_id = 1;
      UPDATE plog_summary_nodes SET level = 1, start_sec = 4, end_sec = 8, text = 'Child' WHERE id = 3;
    `);
    const query = vi.spyOn(pg.Client.prototype, "query");
    const graphs = await listReadyGraphs(env, [20, 10, 70, 30, 40, 99]);
    expect(query).toHaveBeenCalledTimes(4);
    query.mockRestore();
    expect(graphs.map(graph => graph.video_id)).toEqual([20, 10, 70]);
    expect(graphs[0].concepts.map(concept => concept.id)).toEqual([2]);
    expect(graphs[1].concepts.map(concept => concept.id)).toEqual([4, 3, 1]);
    expect(graphs[1].concepts[2]).toEqual({
      id: 1, label: '', intro_sec: 6, embedding: [],
    });
    expect(graphs[1].learning_objects).toEqual({ 1: {
      opening_question: 'Question', hint_ladder: ['hint'], misconceptions: [],
      waypoints: [{ start_sec: 1, end_sec: 2 }],
    } });
    expect(graphs[1].edges).toEqual([{ source_id: 1, target_id: 1, edge_type: 'presentation_order' }]);
    expect(graphs[1].summary_nodes).toEqual([
      { level: 0, text: '', start_sec: 0, end_sec: 0 },
      { level: 1, text: 'Child', start_sec: 4, end_sec: 8 },
    ]);
    expect(graphs[2]).toEqual({ video_id: 70, concepts: [], edges: [], learning_objects: {}, summary_nodes: [] });
  });

  it("reads generated hint text in both the editor and study mode, preserving rung order", async () => {
    await admin.query("UPDATE plog_learning_objects SET hint_ladder = $1::jsonb WHERE concept_id = 1", [
      JSON.stringify(["First hint", { text: "ヒント本文", level: 2 }, { text: "Final hint", level: 1 }]),
    ]);
    const graph = await getPlogGraph(env, 10, "owner");
    expect(graph).toMatchObject({ concepts: [expect.objectContaining({
      id: 1, hint_ladder: ["First hint", "ヒント本文", "Final hint"], hint_count: 3,
    })] });
    const [study] = await listReadyGraphs(env, [10]);
    expect(nextHint(study.learning_objects[1], 1)).toEqual({ text: "ヒント本文", index: 1 });
    expect(nextHint(study.learning_objects[1], 2)).toEqual({ text: "Final hint", index: 2 });
  });

  it("omits editor-only material from study database replies while retaining it for editing", async () => {
    const material = "Long editing material 日本語😀 ".repeat(20_000);
    await admin.query("UPDATE plog_concepts SET source_quote = $1 WHERE id = 1", [material]);
    await admin.query("UPDATE plog_edges SET quote = $1 WHERE id = 1", [material]);
    await admin.query(`
      UPDATE plog_learning_objects SET canonical_order = $1::jsonb, worked_examples = $1::jsonb,
        opening_question = 'Question', hint_ladder = '["Hint"]', misconceptions = '["Misconception"]',
        waypoints = '[{"start_sec":1,"end_sec":2}]' WHERE concept_id = 1
    `, [JSON.stringify([material])]);

    const query = vi.spyOn(pg.Client.prototype, "query");
    const [study] = await listReadyGraphs(env, [10]);
    expect(study.learning_objects[1]).toMatchObject({
      opening_question: "Question", hint_ladder: ["Hint"], misconceptions: ["Misconception"],
      waypoints: [{ start_sec: 1, end_sec: 2 }],
    });
    expect(query).toHaveBeenCalledTimes(4);
    // Check actual database replies, so dropping fields only after transfer cannot pass.
    for (const result of query.mock.results) {
      const reply = await result.value as pg.QueryResult;
      expect(Buffer.byteLength(JSON.stringify(reply.rows))).toBeLessThan(4096);
    }
    query.mockRestore();

    const editor = await getPlogGraph(env, 10, "owner");
    expect(editor?.concepts[0]).toMatchObject({
      source_quote: material, canonical_order: [material], worked_examples: [material],
    });
    expect(editor?.edges[0].quote).toBe(material);
  });

  it("uses the newer job ID to break timestamp ties and skips artifact queries if no graph is ready", async () => {
    await admin.query(`
      INSERT INTO plog_build_jobs (id, video_id, status, created_at)
        SELECT 3, video_id, 'pending', created_at FROM plog_build_jobs WHERE id = 1;
    `);
    const query = vi.spyOn(pg.Client.prototype, "query");
    await expect(listReadyGraphs(env, [10, 99])).resolves.toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
    query.mockRestore();
    await expect(getPlogGraph(env, 10, "owner")).resolves.toMatchObject({ build_status: "pending" });
    await expect(createConcept(env, {
      videoId: 10, label: "New concept", nodeType: "object", introSec: 0, sourceQuote: "", embedding: [],
    })).rejects.toBeInstanceOf(PlogEditError);
  });

  it("does not connect for an empty video list", async () => {
    const connect = vi.spyOn(pg.Client.prototype, "connect");
    await expect(listReadyGraphs(env, [])).resolves.toEqual([]);
    expect(connect).not.toHaveBeenCalled();
  });

  it("still rejects malformed embeddings in a ready graph", async () => {
    await admin.query("UPDATE plog_concepts SET embedding = '[1]' WHERE id = 1");
    await expect(listReadyGraphs(env, [10])).rejects.toMatchObject({ reason: "EMBEDDING_DATA_INVALID" });
  });
});
