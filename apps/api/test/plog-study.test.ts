import { embedding as testEmbedding } from "./helpers/embedding";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { runStudy, PlogNotReadyError, EphemeralLearnerStateStore } from "../src/lib/plog-study";
import type { Bindings } from "../src/types/bindings";
import { getPlogStudyConfig } from "../src/lib/prompts";

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

type SessionState = {
  revision: number;
  states: Record<string, {
    concept_id: number;
    reached: boolean;
    hint_index: number;
    last_grade: string;
    active: boolean;
  }>;
};

function memoryStudySessions() {
  const sessions = new Map<string, SessionState>();
  const locks = new Map<string, string>();
  const commits = vi.fn();
  const lockAttempts = vi.fn();
  const releases = vi.fn();
  let forcedContentions = 0;
  return {
    namespace: {
      getByName(key: string) {
        return {
          async tryAcquire(token: string) {
            lockAttempts(key, token);
            if (forcedContentions > 0) {
              forcedContentions -= 1;
              return { acquired: false, retryAfterMs: 1 };
            }
            const current = locks.get(key);
            if (current && current !== token) {
              return { acquired: false, retryAfterMs: 1 };
            }
            locks.set(key, token);
            return { acquired: true, retryAfterMs: 0 };
          },
          async getSnapshot() {
            return structuredClone(sessions.get(key) ?? { revision: 0, states: {} });
          },
          async commit(
            expectedRevision: number,
            states: SessionState["states"],
            token: string,
          ) {
            commits(key, expectedRevision, states);
            if (locks.get(key) !== token) return false;
            const current = sessions.get(key) ?? { revision: 0, states: {} };
            if (current.revision !== expectedRevision) return false;
            sessions.set(key, { revision: expectedRevision + 1, states: structuredClone(states) });
            locks.delete(key);
            return true;
          },
          async release(token: string) {
            releases(key, token);
            if (locks.get(key) === token) locks.delete(key);
          },
        };
      },
    } as unknown as NonNullable<Bindings["STUDY_SESSION"]>,
    commits,
    lockAttempts,
    releases,
    contendOnce() {
      forcedContentions += 1;
    },
    seed(key: string, states: SessionState["states"]) {
      sessions.set(key, { revision: 1, states: structuredClone(states) });
    },
  };
}

let studySessions = memoryStudySessions();

const ENV = {
  ENVIRONMENT: "development",
  AUTH_JWT_SECRET: "x",
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
  OPENAI_API_KEY: "sk-test",
  OPENAI_BASE_URL: "https://openai.test/v1",
  STUDY_SESSION: studySessions.namespace,
} as unknown as Bindings;

function readyGraphRows(): void {
  rowsFor = (sql) => {
    if (sql.includes("FROM pg_attribute")) return [{ type_name: "vector", dimensions: 1536 }];
    if (sql.includes("FROM plog_build_jobs")) return [{ status: "ready" }];
    if (sql.includes("FROM plog_concepts")) {
      return [
        {
          id: 1,
          video_id: 10,
          label: "オアゲート",
          node_type: "object",
          intro_sec: 1,
          source_quote: "",
          embedding: JSON.stringify(testEmbedding(1, 0)),
          lo_id: 100,
          opening_question: "「オアゲート」について、すでに知っていることは何ですか？",
          hint_ladder: JSON.stringify(["ヒント1", "ヒント2"]),
          misconceptions: JSON.stringify([]),
          canonical_order: JSON.stringify([]),
          worked_examples: JSON.stringify([]),
          waypoints: JSON.stringify([{ start_time: "00:00:01", end_time: "00:00:05" }]),
        },
        {
          id: 2,
          video_id: 10,
          label: "ノットゲート",
          node_type: "object",
          intro_sec: 2,
          source_quote: "",
          embedding: JSON.stringify(testEmbedding(0, 1)),
          lo_id: 101,
          opening_question: "「ノットゲート」について、すでに知っていることは何ですか？",
          hint_ladder: JSON.stringify(["ヒントA"]),
          misconceptions: JSON.stringify([]),
          canonical_order: JSON.stringify([]),
          worked_examples: JSON.stringify([]),
          waypoints: JSON.stringify([]),
        },
      ];
    }
    if (sql.includes("FROM plog_edges")) {
      return [
        {
          id: 1,
          video_id: 10,
          source_id: 1,
          target_id: 2,
          edge_type: "builds_on",
          quote: "q",
        },
      ];
    }
    if (sql.includes("FROM plog_summary_nodes")) return [];
    if (sql.includes("FROM videos")) {
      return [{ title: "Logic Gates", transcript: "" }];
    }
    return [];
  };
}

beforeEach(() => {
  calls.length = 0;
  studySessions = memoryStudySessions();
  ENV.STUDY_SESSION = studySessions.namespace;
  readyGraphRows();
});
afterEach(() => vi.unstubAllGlobals());

describe("EphemeralLearnerStateStore", () => {
  it("複数の変更を外部I/Oなしで1つのsnapshotにまとめる", async () => {
    const store = new EphemeralLearnerStateStore(
      {},
      new Map([[1, 10]]),
    );
    await store.upsert(1, { active: true, hint_index: 0 });
    await store.upsert(1, { reached: true });
    expect(store.snapshot()).toEqual({
      "1": {
        concept_id: 1,
        reached: true,
        hint_index: 0,
        last_grade: "",
        active: true,
      },
    });
  });
});

describe("runStudy smoke", () => {
  it.each(["schema", "stored data"])("rejects invalid %s before grading or committing progress", async (stage) => {
    const originalRowsFor = rowsFor;
    rowsFor = (sql, args) => {
      if (stage === "schema" && sql.includes("FROM pg_attribute")) return [{ type_name: "vector", dimensions: 1024 }];
      const rows = originalRowsFor(sql, args);
      return stage === "stored data" && sql.includes("FROM plog_concepts")
        ? rows.map((row) => ({ ...row, embedding: "[1,2]" })) : rows;
    };
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(runStudy(ENV, {
      messages: [{ role: "assistant", content: "前の質問" }, { role: "user", content: "回答" }],
      videoIds: [10], locale: "ja", studySessionId: "invalid",
    })).rejects.toMatchObject({ reason: stage === "schema" ? "EMBEDDING_SCHEMA_MISMATCH" : "EMBEDDING_DATA_INVALID" });
    expect(fetch).not.toHaveBeenCalled();
    expect(studySessions.commits).not.toHaveBeenCalled();
  });

  it.each([
    { routing: "semantic match", embedding: testEmbedding(1, 0) },
    { routing: "first-unreached fallback", embedding: testEmbedding(0, 0, 1) },
  ])("single-concept study opens and stays completed after mastery ($routing)", async ({ embedding }) => {
    const originalRowsFor = rowsFor;
    rowsFor = (sql, args) => {
      if (sql.includes("FROM plog_edges")) return [];
      const rows = originalRowsFor(sql, args);
      return sql.includes("FROM plog_concepts") ? rows.slice(0, 1) : rows;
    };
    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/embeddings")) {
        return Response.json({ data: [{ index: 0, embedding }] });
      }
      if (url.endsWith("/chat/completions")) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        expect(body.max_tokens).toBe(256);
        return Response.json({
          choices: [{ message: { content: '{"grade":"mastery","reason":"correct"}' } }],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const session = { videoIds: [10], locale: "ja", studySessionId: "single" };

    const opening = await runStudy(ENV, {
      ...session,
      messages: [{ role: "user", content: "始めます" }],
    });
    expect(opening.content).toContain("オアゲート");
    expect(opening.citations?.[0]?.video_id).toBe(10);
    expect(studySessions.commits).toHaveBeenLastCalledWith("single", 0, {
      "1": { concept_id: 1, reached: false, hint_index: 0, last_grade: "", active: true },
    });

    const completed = await runStudy(ENV, {
      ...session,
      messages: [
        { role: "assistant", content: opening.content },
        { role: "user", content: "どちらかの入力が1なら出力が1になる論理和のゲートです" },
      ],
    });
    expect(completed.content).toContain("学習パス上の概念を一通り終えました");
    expect(studySessions.commits).toHaveBeenLastCalledWith("single", 1, {
      "1": { concept_id: 1, reached: true, hint_index: 0, last_grade: "mastery", active: false },
    });

    const next = await runStudy(ENV, {
      ...session,
      messages: [
        { role: "assistant", content: completed.content },
        { role: "user", content: "続けます" },
      ],
    });
    expect(next.content).toContain("学習パス上の概念を一通り終えました");
    expect(next.content).not.toContain("mastery");
    expect(studySessions.commits).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/chat/completions")))
      .toHaveLength(1);
  });

  it("opening turn returns LO opening without calling generative LLM", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/embeddings")) {
        return new Response(JSON.stringify({ data: [{ index: 0, embedding: testEmbedding(1, 0) }] }), {
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runStudy(ENV, {
      messages: [{ role: "user", content: "始めます" }],
      videoIds: [10],
      locale: "ja",
      studySessionId: "s1",
    });

    expect(result.content).toContain("オアゲート");
    expect(result.content).toContain("[1]");
    expect(result.citations?.[0]?.video_id).toBe(10);
    // grading/study LLM は opening では呼ばない（embed のみ）
    expect(fetchMock.mock.calls.every((c) => String(c[0]).endsWith("/embeddings"))).toBe(
      true,
    );
    expect(studySessions.commits).toHaveBeenCalledTimes(1);
  });

  it("競合中はLLM実行前に待ち、ターンを一度だけ計算する", async () => {
    studySessions.contendOnce();
    const fetchMock = vi.fn(async (input: RequestInfo) => {
      if (String(input).endsWith("/embeddings")) {
        return new Response(JSON.stringify({ data: [{ index: 0, embedding: testEmbedding(1, 0) }] }), {
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected fetch: ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      runStudy(ENV, {
        messages: [{ role: "user", content: "始めます" }],
        videoIds: [10],
        locale: "ja",
        studySessionId: "conflict",
      }),
    ).resolves.toMatchObject({ queryText: "始めます" });
    expect(studySessions.lockAttempts).toHaveBeenCalledTimes(2);
    expect(studySessions.commits).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws PlogNotReadyError when no ready graphs", async () => {
    rowsFor = (sql) => {
    if (sql.includes("FROM pg_attribute")) return [{ type_name: "vector", dimensions: 1536 }];
      if (sql.includes("FROM plog_build_jobs")) return [{ status: "pending" }];
      return [];
    };
    await expect(
      runStudy(ENV, {
        messages: [{ role: "user", content: "hi" }],
        videoIds: [10],
        locale: "ja",
        studySessionId: "s1",
      }),
    ).rejects.toBeInstanceOf(PlogNotReadyError);
  });

  it("throws when videoIds empty", async () => {
    await expect(
      runStudy(ENV, {
        messages: [{ role: "user", content: "hi" }],
        videoIds: [],
        locale: "ja",
        studySessionId: "s1",
      }),
    ).rejects.toMatchObject({
      name: "PlogNotReadyError",
      message: "Study mode requires a video course with members.",
    });
  });

  it("generative turn calls study LLM with mocked reply", async () => {
    // Pre-seed active state so opening is skipped and grading+generate run.
    studySessions.seed("s-gen", {
      "1": {
        concept_id: 1,
        reached: false,
        hint_index: 0,
        last_grade: "partial",
        active: true,
      },
    });

    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/embeddings")) {
        return new Response(JSON.stringify({ data: [{ index: 0, embedding: testEmbedding(1, 0) }] }), {
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/chat/completions")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          max_tokens?: number;
          messages?: { role: string; content: string }[];
        };
        // grading (256) vs study (1024)
        if (body.max_tokens === 256) {
          return new Response(
            JSON.stringify({
              choices: [{ message: { content: '{"grade":"partial","reason":"ok"}' } }],
            }),
            { headers: { "content-type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "もう少し考えてみましょうか？" } }],
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runStudy(ENV, {
      messages: [
        { role: "assistant", content: "「オアゲート」について、すでに知っていることは何ですか？" },
        { role: "user", content: "論理和のゲートです" },
      ],
      videoIds: [10],
      locale: "ja",
      studySessionId: "s-gen",
    });

    expect(result.content).toContain("考えてみましょう");
    const chatCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).endsWith("/chat/completions"),
    );
    expect(chatCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("study grading and help requests", () => {
  const initial: SessionState["states"] = {
    "1": { concept_id: 1, reached: false, hint_index: 0, last_grade: "", active: true },
  };
  const submit = (reply: string, locale = "ja", prior = "入力が両方0なら出力は？") => runStudy(ENV, {
    messages: [{ role: "assistant", content: prior }, { role: "user", content: reply }],
    videoIds: [10], locale, studySessionId: "grading",
  });
  const mockModel = (grade: string | Response) => {
    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      if (String(input).endsWith("/embeddings")) {
        return Response.json({ data: [{ index: 0, embedding: testEmbedding(1, 0) }] });
      }
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (body.max_tokens === 256 && grade instanceof Response) return grade.clone();
      return Response.json({ choices: [{ message: {
        content: body.max_tokens === 256 ? grade : "入力に注目してみましょう。どの条件で変化しますか？",
      } }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };
  beforeEach(() => studySessions.seed("grading", initial));

  it.each([
    ["ヒントを教えて", "現在のヒント: ヒント1", 0],
    ["なんで出力が変わるの？", "入力に注目", 1],
    ["答えをそのまま教えて", "ここでは答えをそのまま教えません", 0],
  ])("does not grade or advance %s, even directly after opening", async (reply, text, calls) => {
    const fetchMock = mockModel('{"grade":"miss","reason":"must not be called"}');
    const result = await submit(String(reply));
    expect(result.content).toContain(String(text));
    expect(result.content).toContain("採点対象外");
    expect(studySessions.commits).toHaveBeenLastCalledWith("grading", 1, initial);
    expect(fetchMock).toHaveBeenCalledTimes(Number(calls));
    for (const [, init] of fetchMock.mock.calls) {
      expect(JSON.parse(String(init?.body)).max_tokens).toBe(1024);
      expect(String(init?.body)).toContain("Help request (not graded)");
      expect(String(init?.body)).not.toContain("Current answer grade");
    }
  });

  it("keeps all progress fields and bypasses prerequisite routing for a help request", async () => {
    const states = {
      "1": { ...initial["1"]!, hint_index: 1, last_grade: "miss", active: false },
      "2": { concept_id: 2, reached: false, hint_index: 0, last_grade: "partial", active: true },
    };
    studySessions.seed("grading", states);
    const fetchMock = mockModel("invalid");
    const result = await submit("ヒントを教えて");
    expect(result.content).toContain("ヒントA");
    expect(studySessions.commits).toHaveBeenLastCalledWith("grading", 1, states);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("grades a short correct answer by meaning, advances, and shows its reason", async () => {
    const fetchMock = mockModel('{"grade":"mastery","reason":"問いの条件に合っています"}');
    const result = await submit("0");
    expect(result.content).toContain("mastery");
    expect(result.content).toContain("理由: 問いの条件に合っています");
    expect(result.content).toContain("次は「ノットゲート」");
    expect(studySessions.commits).toHaveBeenLastCalledWith("grading", 1, {
      "1": { ...initial["1"], reached: true, active: false, last_grade: "mastery" },
      "2": { concept_id: 2, reached: false, hint_index: 0, last_grade: "", active: true },
    });
    const prompt = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)).messages[1].content;
    expect(prompt).toContain("入力が両方0なら出力は？");
    expect(prompt).toContain("Saved opening question:");
  });

  it.each(["partial", "miss"])("shows %s and reason and advances the hint only up to its last rung", async (grade) => {
    mockModel(JSON.stringify({ grade, reason: "条件をもう一つ確認してください" }));
    for (const revision of [1, 2]) {
      const result = await submit("片方が1なら");
      expect(result.content).toContain(`（${grade}）。理由: 条件をもう一つ確認してください`);
      expect(studySessions.commits).toHaveBeenLastCalledWith("grading", revision, {
        "1": { ...initial["1"], hint_index: 1, last_grade: grade },
      });
    }
  });

  it.each([
    ["provider failure", Response.json({ error: { message: "unavailable" } }, { status: 403 })],
    ["invalid JSON", "{broken"], ["missing grade", '{"reason":"unknown"}'],
    ["invalid grade", '{"grade":"correct","reason":"unknown"}'],
    ["missing reason", '{"grade":"mastery"}'],
    ["empty reason", '{"grade":"miss","reason":"  "}'],
    ["wrong reason type", '{"grade":"partial","reason":false}'],
    ["no judgment", '{"grade":"ungradable","reason":"insufficient context"}'],
    ["null", "null"],
  ])("preserves progress for %s, without guessing from answer length", async (_name, output) => {
    const states = { "1": { ...initial["1"]!, hint_index: 1, last_grade: "partial" } };
    studySessions.seed("grading", states);
    const fetchMock = mockModel(output);
    for (const [index, reply] of ["0", "片方が1であれば出力が1になるゲートです"].entries()) {
      const result = await submit(reply);
      expect(result.content).toBe(getPlogStudyConfig("ja").grading_unavailable);
      expect(studySessions.commits).toHaveBeenLastCalledWith("grading", index + 1, states);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([, init]) => JSON.parse(String(init?.body)).max_tokens === 256)).toBe(true);
  });

  it("allows retry after a failed grade and retains the tutor question across a locale change", async () => {
    mockModel("bad JSON");
    const failed = await submit("0");
    const fetchMock = mockModel('{"grade":"mastery","reason":"Matches the question"}');
    const result = await runStudy(ENV, {
      messages: [
        { role: "assistant", content: "入力が両方0なら出力は？" },
        { role: "user", content: "0" }, { role: "assistant", content: failed.content },
        { role: "user", content: "0" },
      ],
      videoIds: [10], locale: "en", studySessionId: "grading",
    });
    expect(result.content).toContain("AI assessment: ready to move on (mastery). Reason: Matches the question");
    const prompt = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)).messages[1].content;
    expect(prompt).toContain("入力が両方0なら出力は？");
    expect(prompt).not.toContain(failed.content);
  });
});
