import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { runStudy, PlogNotReadyError, EphemeralLearnerStateStore } from "../src/lib/plog-study";
import type { Bindings } from "../src/types/bindings";

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
          embedding: JSON.stringify([1, 0]),
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
          embedding: JSON.stringify([0, 1]),
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
  it("opening turn returns LO opening without calling generative LLM", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/embeddings")) {
        return new Response(JSON.stringify({ data: [{ embedding: [1, 0] }] }), {
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
        return new Response(JSON.stringify({ data: [{ embedding: [1, 0] }] }), {
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
        return new Response(JSON.stringify({ data: [{ embedding: [1, 0] }] }), {
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
