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

function memoryKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (key: string, type?: string) => {
      const v = store.get(key);
      if (v === undefined) return null;
      if (type === "json") return JSON.parse(v);
      return v;
    },
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
    delete: async (key: string) => {
      store.delete(key);
    },
    list: async () => ({ keys: [], list_complete: true, cursor: "" }),
    getWithMetadata: async () => ({ value: null, metadata: null }),
  } as unknown as KVNamespace;
}

const ENV = {
  ENVIRONMENT: "development",
  JWT_SECRET: "x",
  LEGACY_API_ORIGIN: "https://legacy.test",
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
  OPENAI_API_KEY: "sk-test",
  OPENAI_BASE_URL: "https://openai.test/v1",
  STUDY_SESSION: memoryKv(),
} as unknown as Bindings;

function readyGraphRows(): void {
  rowsFor = (sql) => {
    if (sql.includes("FROM app_plogbuildjob")) return [{ status: "ready" }];
    if (sql.includes("FROM app_plogconcept")) {
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
    if (sql.includes("FROM app_plogedge")) {
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
    if (sql.includes("FROM app_plogsummarynode")) return [];
    if (sql.includes("FROM app_video")) {
      return [{ title: "Logic Gates", transcript: "" }];
    }
    return [];
  };
}

beforeEach(() => {
  calls.length = 0;
  ENV.STUDY_SESSION = memoryKv();
  readyGraphRows();
});
afterEach(() => vi.unstubAllGlobals());

describe("EphemeralLearnerStateStore", () => {
  it("persists under plog:study:ephemeral: with 12h TTL key pattern", async () => {
    const put = vi.fn(async () => {});
    const kv = {
      get: async () => null,
      put,
    } as unknown as KVNamespace;
    const store = new EphemeralLearnerStateStore(
      kv,
      "sess-abc",
      new Map([[1, 10]]),
    );
    await store.upsert(1, { active: true, hint_index: 0 });
    expect(put).toHaveBeenCalledWith(
      "plog:study:ephemeral:sess-abc",
      expect.any(String),
      { expirationTtl: 12 * 60 * 60 },
    );
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
  });

  it("throws PlogNotReadyError when no ready graphs", async () => {
    rowsFor = (sql) => {
      if (sql.includes("FROM app_plogbuildjob")) return [{ status: "pending" }];
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
      message: "Study mode requires a video group with members.",
    });
  });

  it("generative turn calls study LLM with mocked reply", async () => {
    // Pre-seed active state so opening is skipped and grading+generate run.
    const store = new EphemeralLearnerStateStore(
      ENV.STUDY_SESSION!,
      "s-gen",
      new Map([
        [1, 10],
        [2, 10],
      ]),
    );
    await store.upsert(1, { active: true, hint_index: 0, last_grade: "partial" });

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
