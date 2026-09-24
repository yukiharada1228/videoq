import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getEvaluationSummary, listEvaluationLogs } from "../src/repositories/evaluation-repository";
import type { Bindings } from "../src/types/bindings";

const databaseUrl = process.env.QUOTA_TEST_DATABASE_URL;

(databaseUrl ? describe : describe.skip)("evaluation reads on PostgreSQL", () => {
  const schema = `evaluation_${crypto.randomUUID().replaceAll("-", "")}`;
  let admin: pg.Client;
  let env: Bindings;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: databaseUrl });
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`SET search_path TO "${schema}"`);
    await admin.query(`
      CREATE TABLE video_courses (id bigint PRIMARY KEY, user_id text NOT NULL);
      CREATE TABLE chat_logs (
        id bigint PRIMARY KEY, course_id bigint NOT NULL REFERENCES video_courses ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT '2026-09-01T00:00:00Z'
      );
      CREATE TABLE chat_log_evaluations (
        id bigint PRIMARY KEY,
        chat_log_id bigint NOT NULL UNIQUE REFERENCES chat_logs ON DELETE CASCADE,
        status varchar(20) NOT NULL, faithfulness double precision, answer_relevancy double precision,
        context_precision double precision, error_message text NOT NULL DEFAULT '', evaluated_at timestamptz
      );
      INSERT INTO video_courses VALUES
        (1, 'owner'), (2, 'owner'), (3, 'outsider'), (4, 'owner'), (5, 'owner'), (6, 'owner'),
        (7, 'owner'), (8, 'owner');
      INSERT INTO chat_logs (id, course_id) VALUES
        (9, 1), (10, 1), (11, 1), (12, 1), (13, 1), (14, 1), (20, 3), (40, 4), (50, 5), (60, 6),
        (70, 7), (71, 7), (72, 7), (73, 7), (74, 7), (80, 8), (81, 8), (82, 8);
      UPDATE chat_logs SET created_at = '2026-09-02T00:00:00Z' WHERE id = 9;
      INSERT INTO chat_log_evaluations (id, chat_log_id, status, faithfulness, answer_relevancy, context_precision) VALUES
        (9, 9, 'pending', NULL, NULL, NULL),
        (10, 10, 'completed', 0.2, 0.4, NULL), (11, 11, 'completed', 0.8, NULL, 0.6),
        (12, 12, 'pending', 0.9, 0.9, 0.9), (13, 13, 'failed', 0.7, 0.7, 0.7),
        (20, 20, 'completed', 1, 1, 1), (40, 40, 'pending', 1, 1, 1),
        (60, 60, 'completed', NULL, NULL, NULL),
        (70, 70, 'completed', 0, 0.2, 0.3), (71, 71, 'completed', 1, 0.8, 0.7),
        (72, 72, 'completed', 'NaN', 'Infinity', '-Infinity'),
        (73, 73, 'completed', 'Infinity', '-Infinity', 'NaN'),
        (74, 74, 'completed', '-Infinity', 'NaN', 'Infinity'),
        (80, 80, 'completed', 'NaN', 'Infinity', '-Infinity'),
        (81, 81, 'completed', 'Infinity', '-Infinity', 'NaN'),
        (82, 82, 'completed', '-Infinity', 'NaN', 'Infinity');
      UPDATE chat_log_evaluations SET evaluated_at = '2026-09-02T09:00:00+09:00' WHERE id IN (10, 11);
      UPDATE chat_log_evaluations SET error_message = 'Provider unavailable' WHERE id = 13;
    `);
    const url = new URL(databaseUrl!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    env = { HYPERDRIVE: { connectionString: url.toString() } } as Bindings;
  });

  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    try { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await admin.end(); }
  });

  it("authorizes and summarizes completed evaluations with one query", async () => {
    const query = vi.spyOn(pg.Client.prototype, "query");
    const connect = vi.spyOn(pg.Client.prototype, "connect");
    await expect(getEvaluationSummary(env, 1, "owner")).resolves.toEqual({
      course_id: 1, evaluated_count: 2,
      avg_faithfulness: 0.5, avg_answer_relevancy: 0.4, avg_context_precision: 0.6,
    });
    expect(query).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it.each([2, 4, 5])("returns zero and null averages for course %s without completed evaluations", async courseId => {
    const query = vi.spyOn(pg.Client.prototype, "query");
    await expect(getEvaluationSummary(env, courseId, "owner")).resolves.toEqual({
      course_id: courseId, evaluated_count: 0,
      avg_faithfulness: null, avg_answer_relevancy: null, avg_context_precision: null,
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("counts a completed evaluation even when all its metrics are null", async () => {
    await expect(getEvaluationSummary(env, 6, "owner")).resolves.toEqual({
      course_id: 6, evaluated_count: 1,
      avg_faithfulness: null, avg_answer_relevancy: null, avg_context_precision: null,
    });
  });

  it.each([
    { courseId: 7, count: 5, average: 0.5 },
    { courseId: 8, count: 3, average: null },
  ])("ignores stored non-finite scores in course $courseId averages", async ({ courseId, count, average }) => {
    await expect(getEvaluationSummary(env, courseId, "owner")).resolves.toEqual({
      course_id: courseId, evaluated_count: count,
      avg_faithfulness: average, avg_answer_relevancy: average, avg_context_precision: average,
    });
  });

  it("returns missing scores for stored non-finite values without losing valid scores or log order", async () => {
    const missing = { status: "completed", faithfulness: null, answer_relevancy: null, context_precision: null, error_message: "", evaluated_at: null };
    await expect(listEvaluationLogs(env, 7, "owner", 5, 0)).resolves.toEqual({
      count: 5,
      results: [
        { ...missing, chat_log_id: 74 },
        { ...missing, chat_log_id: 73 },
        { ...missing, chat_log_id: 72 },
        { ...missing, chat_log_id: 71, faithfulness: 1, answer_relevancy: 0.8, context_precision: 0.7 },
        { ...missing, chat_log_id: 70, faithfulness: 0, answer_relevancy: 0.2, context_precision: 0.3 },
      ],
    });
  });

  it.each([3, 99])("hides summary and logs for foreign or missing course %s", async courseId => {
    const query = vi.spyOn(pg.Client.prototype, "query");
    await expect(getEvaluationSummary(env, courseId, "owner")).resolves.toEqual({ notFound: true });
    expect(query).toHaveBeenCalledTimes(1);
    query.mockClear();
    await expect(listEvaluationLogs(env, courseId, "owner", 2, 0)).resolves.toEqual({ notFound: true });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("paginates evaluations in a stable order with two queries per page", async () => {
    const query = vi.spyOn(pg.Client.prototype, "query");
    const pages = [];
    const queryCounts = [];
    for (const offset of [0, 2, 4]) {
      pages.push(await listEvaluationLogs(env, 1, "owner", 2, offset));
      queryCounts.push(query.mock.calls.length);
      query.mockClear();
    }
    const emptyMetrics = { faithfulness: null, answer_relevancy: null, context_precision: null };
    const completed = { status: "completed", error_message: "", evaluated_at: "2026-09-02T00:00:00.000Z" };
    expect(pages).toEqual([
      { count: 5, results: [
        { chat_log_id: 9, status: "pending", ...emptyMetrics, error_message: "", evaluated_at: null },
        { chat_log_id: 13, status: "failed", faithfulness: 0.7, answer_relevancy: 0.7, context_precision: 0.7, error_message: "Provider unavailable", evaluated_at: null },
      ] },
      { count: 5, results: [
        { chat_log_id: 12, status: "pending", faithfulness: 0.9, answer_relevancy: 0.9, context_precision: 0.9, error_message: "", evaluated_at: null },
        { chat_log_id: 11, ...completed, faithfulness: 0.8, answer_relevancy: null, context_precision: 0.6 },
      ] },
      { count: 5, results: [
        { chat_log_id: 10, ...completed, faithfulness: 0.2, answer_relevancy: 0.4, context_precision: null },
      ] },
    ]);
    expect(queryCounts).toEqual([2, 2, 2]);
  });

  it.each([
    { courseId: 2, offset: 0, count: 0 },
    { courseId: 5, offset: 0, count: 0 },
    { courseId: 1, offset: 5, count: 5 },
    { courseId: 1, offset: 100, count: 5 },
  ])("skips fetching an empty page for %j", async ({ courseId, offset, count }) => {
    const query = vi.spyOn(pg.Client.prototype, "query");
    await expect(listEvaluationLogs(env, courseId, "owner", 2, offset)).resolves.toEqual({ count, results: [] });
    expect(query).toHaveBeenCalledTimes(1);
  });
});
