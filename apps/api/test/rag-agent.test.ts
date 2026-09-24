import { embedding as testEmbedding } from "./helpers/embedding";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { CourseDetail } from "../src/repositories/course-repository";
import { getCourseInfo } from "../src/repositories/course-repository";
import { MAX_COURSE_INFO_CALLS, COURSE_DESCRIPTION_LIMIT, VIDEO_DESCRIPTION_LIMIT } from "../src/lib/rag-course-info";
import type { SceneHit } from "../src/repositories/vector-repository";
import type { Bindings } from "../src/types/bindings";
import { LlmConfigurationError, LlmProviderError } from "../src/lib/openai";
import type { RagStreamChunk } from "../src/lib/rag";
import { LLM_STREAM_TIMEOUT_MS } from "../src/lib/llm";
import { stalledChatResponse } from "./helpers/stalled-chat-response";

/**
 * ReAct（createAgent + search_scenes）の振る舞い。
 * ベクトルストアは差し替え、OpenAI は tool_calls → 最終回答の 2 ターンを返す偽サーバで検証する。
 */

const searchCalls: string[] = [];
let closed = 0;
let opened = 0;
let closeError: Error | undefined;
let searchSignal: AbortSignal | undefined;
const videoSelections: (readonly number[] | undefined)[] = [];
let hitsByQuery: (query: string) => SceneHit[] | Promise<SceneHit[]>;

vi.mock("../src/repositories/vector-repository", () => ({
  openSceneSearch: async (_env: Bindings, _scope: unknown, signal?: AbortSignal) => {
    opened += 1;
    searchSignal = signal;
    return {
    search: async (query: string, videoIds?: readonly number[]) => {
      searchCalls.push(query);
      videoSelections.push(videoIds);
      return hitsByQuery(query);
    },
    close: async () => {
      closed += 1;
      if (closeError) throw closeError;
    },
    };
  },
}));

vi.mock("../src/repositories/course-repository", () => ({ getCourseInfo: vi.fn() }));

const { runRag, streamRag, MAX_SCENE_SEARCHES, MAX_TOOL_ROUNDS } = await import("../src/lib/rag");

const ENV = {
  OPENAI_API_KEY: "sk-test",
  OPENAI_BASE_URL: "https://openai.test/v1",
  HYPERDRIVE: { connectionString: "postgres://fake/db" },
} as unknown as Bindings;

const PARAMS = {
  messages: [{ role: "user", content: "pgvector とは？" }],
  ownerUserId: "00000000-0000-4000-8000-000000000005",
  videoIds: [60, 61],
  locale: "ja",
};

const scene = (n: number, videoId = 60): SceneHit => ({
  content: `scene ${n}`,
  videoId,
  videoTitle: `Video ${videoId}`,
  startTime: `00:0${n}:00`,
  endTime: `00:0${n}:30`,
});

const COURSE: CourseDetail = {
  id: 3, name: "デジタル回路", description: "回路の基礎を学ぶ講座", video_count: 2,
  display_order: 0, created_at: "2026-09-14T00:00:00Z", updated_at: "2026-09-14T00:00:00Z",
  access_role: "owner", share_slug: "private-share-token",
  videos: [60, 61].map((id, index) => ({
    id, title: `第${index + 7}回`, description: `動画${id}の説明`, order: index * 10,
    status: "completed", file: "https://private.example/signed-url", tags: [],
    uploaded_at: "2026-09-14T00:00:00Z", source_type: "uploaded", source_url: null,
    youtube_video_id: null, youtube_embed_url: null,
  })),
};

beforeEach(() => {
  vi.mocked(getCourseInfo).mockReset().mockResolvedValue(COURSE);
});

type Turn =
  | { toolCall: { name: string; args: Record<string, unknown> }; preamble?: string }
  | { content: string }
  | { status: number };

const jsonTurn = (turn: Exclude<Turn, { status: number }>) =>
  "toolCall" in turn
    ? {
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              role: "assistant",
              content: turn.preamble ?? null,
              tool_calls: [
                {
                  id: `call_${turn.toolCall.name}`,
                  type: "function",
                  function: {
                    name: turn.toolCall.name,
                    arguments: JSON.stringify(turn.toolCall.args),
                  },
                },
              ],
            },
          },
        ],
      }
    : {
        choices: [{ finish_reason: "stop", message: { role: "assistant", content: turn.content } }],
      };

const sseFrames = (turn: Exclude<Turn, { status: number }>): string[] => {
  if ("toolCall" in turn) {
    throw new Error("ReAct tool turns must use non-streaming model responses.");
  }
  const words = turn.content.match(/.{1,4}/g) ?? [];
  return [
    // 実際の OpenAI と同じく、最初の delta にだけ role を載せる。
    ...words.map(
      (w, i) =>
        `data: ${JSON.stringify({
          choices: [{ delta: i === 0 ? { role: "assistant", content: w } : { content: w } }],
        })}\n\n`,
    ),
    `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
    "data: [DONE]\n\n",
  ];
};

/** 送信順に turns を返す偽 OpenAI。埋め込みは使われない想定だが念のため応答する。 */
function stubOpenAi(turns: Turn[]) {
  const bodies: Record<string, unknown>[] = [];
  let index = 0;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    if (String(url).endsWith("/embeddings")) {
      return new Response(JSON.stringify({ data: [{ index: 0, embedding: testEmbedding(0.1, 0.2) }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const body = JSON.parse(String(init.body));
    bodies.push(body);
    const turn = turns[Math.min(index++, turns.length - 1)];
    if ("status" in turn) {
      return new Response("upstream failed", { status: turn.status });
    }
    if (!body.stream) {
      return new Response(JSON.stringify(jsonTurn(turn)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const enc = new TextEncoder();
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          // 利用量だけのチャンクが来ても、取得済みの本文は保持する。
          for (const frame of sseFrames(turn)) {
            if (frame === "data: [DONE]\n\n") {
              controller.enqueue(enc.encode(`data: ${JSON.stringify({
                id: `chatcmpl-${index}`,
                choices: [],
                usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
              })}\n\n`));
              controller.enqueue(enc.encode(frame));
            } else {
              const payload = JSON.parse(frame.slice(6));
              controller.enqueue(enc.encode(`data: ${JSON.stringify({ id: `chatcmpl-${index}`, ...payload })}\n\n`));
            }
          }
          controller.close();
        },
      }),
      { status: 200, headers: { "content-type": "text/event-stream" } },
    );
  });
  return bodies;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  searchCalls.length = 0;
  closed = 0;
  opened = 0;
  closeError = undefined;
  searchSignal = undefined;
  videoSelections.length = 0;
});

describe.each([false, true])("Q&A single-question contract (stream=%s)", (stream) => {
  it.each([true, false])("ignores earlier turns even when supplied (course=%s)", async (course) => {
    const bodies = stubOpenAi([{ content: "Which subject would you like an example of?" }]);
    const params = {
      ...PARAMS,
      ...(course ? {} : { ownerUserId: null, videoIds: [] }),
      messages: [
        { role: "user", content: "内積とは？" },
        { role: "assistant", content: "The dot product is…" },
        { role: "user", content: "具体例を教えて" },
      ],
    };
    if (stream) {
      for await (const _chunk of streamRag(ENV, params)) { /* consume the response */ }
    } else {
      await runRag(ENV, params);
    }
    expect(bodies).toHaveLength(1);
    expect(bodies[0].messages).toEqual([
      expect.objectContaining({ role: "system" }),
      expect.objectContaining({ role: "user", content: "具体例を教えて" }),
    ]);
  });
});

describe.each([false, true])("検索障害（stream=%s）", (stream) => {
  it("並列検索の一方が失敗したら残りの検索も中断する", async () => {
    const started = Promise.withResolvers<void>();
    const pending = Promise.withResolvers<SceneHit[]>();
    const failure = new LlmProviderError("embedding failed");
    hitsByQuery = async (query) => {
      if (query === "fail") {
        await started.promise;
        throw failure;
      }
      searchSignal!.addEventListener("abort", () => pending.reject(searchSignal!.reason), { once: true });
      started.resolve();
      return pending.promise;
    };
    const upstream = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ finish_reason: "tool_calls", message: {
        role: "assistant", content: null,
        tool_calls: ["fail", "pending"].map((query) => ({
          id: `call_${query}`, type: "function",
          function: { name: "search_scenes", arguments: JSON.stringify({ query }) },
        })),
      } }],
    }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", upstream);
    try {
      const execute = async () => {
        if (!stream) return runRag(ENV, PARAMS);
        for await (const _chunk of streamRag(ENV, PARAMS)) { /* consume */ }
      };
      await expect(execute()).rejects.toBe(failure);
      expect(searchSignal?.aborted).toBe(true);
      expect(upstream).toHaveBeenCalledOnce();
      expect(closed).toBe(1);
    } finally {
      pending.resolve([]);
    }
  });

  it("接続の後始末に失敗しても元の検索エラーを保つ", async () => {
    const original = new LlmConfigurationError("EMBEDDING_MODEL is required");
    closeError = new Error("pool close failed");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    hitsByQuery = () => { throw original; };
    stubOpenAi([{ toolCall: { name: "search_scenes", args: { query: "scene" } } }]);
    const execute = async () => {
      if (!stream) return runRag(ENV, PARAMS);
      for await (const _chunk of streamRag(ENV, PARAMS)) { /* consume */ }
    };
    await expect(execute()).rejects.toBe(original);
    expect(closed).toBe(1);
    expect(log).toHaveBeenCalledOnce();
  });

  it.each(["", "   "])("空の最終回答を検索前の前置きや成功扱いで補わない: %j", async (content) => {
    hitsByQuery = () => [scene(1)];
    stubOpenAi([
      { toolCall: { name: "search_scenes", args: { query: "scene" } }, preamble: "調べますね。" },
      { content },
    ]);
    const chunks: RagStreamChunk[] = [];
    const execute = async () => {
      if (!stream) return runRag(ENV, PARAMS);
      for await (const chunk of streamRag(ENV, PARAMS)) chunks.push(chunk);
    };

    await expect(execute()).rejects.toThrow(LlmProviderError);
    expect(chunks.some((chunk) => "text" in chunk || "final" in chunk)).toBe(false);
    expect(closed).toBe(1);
  });

  it("検索を実行しなかった動画指定エラーで検索枠を消費しない", async () => {
    hitsByQuery = () => [scene(1)];
    stubOpenAi([
      ...Array.from({ length: MAX_SCENE_SEARCHES }, (): Turn => ({
        toolCall: { name: "search_scenes", args: { query: "scene", video_ids: [999] } },
      })),
      { toolCall: { name: "search_scenes", args: { query: "scene", video_ids: [60] } } },
      { content: "回答 [1]" },
    ]);

    if (stream) {
      const chunks: RagStreamChunk[] = [];
      for await (const chunk of streamRag(ENV, PARAMS)) chunks.push(chunk);
      expect(chunks.at(-1)).toMatchObject({ final: { citations: [{ video_id: 60 }] } });
      expect(chunks).toContainEqual({ searching: "scene", searchId: 1 });
    } else {
      expect((await runRag(ENV, PARAMS)).citations).toHaveLength(1);
    }
    expect(searchCalls).toEqual(["scene"]);
    expect(videoSelections).toEqual([[60]]);
    expect(closed).toBe(1);
  });

  it.each([
    new LlmProviderError("Ollama embeddings unreachable"),
    new LlmConfigurationError("EMBEDDING_MODEL is required"),
    new Error("database unavailable"),
  ])("検索例外を通常回答にせず送出し、接続を閉じる: %s", async (error) => {
    hitsByQuery = () => {
      throw error;
    };
    const bodies = stubOpenAi([
      { toolCall: { name: "search_scenes", args: { query: "scene" } }, preamble: "調べますね。" },
      { content: "検索できませんでした。" },
    ]);

    const chunks: RagStreamChunk[] = [];
    const execute = async () => {
      if (!stream) return runRag(ENV, PARAMS);
      for await (const chunk of streamRag(ENV, PARAMS)) chunks.push(chunk);
    };
    await expect(execute()).rejects.toThrow(
      error instanceof LlmConfigurationError ? LlmConfigurationError : LlmProviderError,
    );
    expect(chunks.some((chunk) => "text" in chunk || "final" in chunk)).toBe(false);
    expect(searchCalls).toEqual(["scene"]);
    expect(bodies).toHaveLength(1);
    expect(closed).toBe(1);
  });

  it("検索失敗後はモデルを再度呼ばず、元の設定エラーを保つ", async () => {
    const error = new LlmConfigurationError("EMBEDDING_MODEL is required");
    hitsByQuery = () => {
      throw error;
    };
    const bodies = stubOpenAi([
      { toolCall: { name: "search_scenes", args: { query: "scene" } } },
      { status: 503 },
    ]);

    const execute = async () => {
      if (!stream) return runRag(ENV, PARAMS);
      for await (const chunk of streamRag(ENV, PARAMS)) {
        expect(chunk).not.toHaveProperty("text");
        expect(chunk).not.toHaveProperty("final");
      }
    };
    await expect(execute()).rejects.toBe(error);
    expect(bodies).toHaveLength(1);
    expect(closed).toBe(1);
  });

  it("ツール引数の不備はモデルが修正して検索を続けられる", async () => {
    hitsByQuery = () => [scene(1)];
    const bodies = stubOpenAi([
      { toolCall: { name: "search_scenes", args: { query: "" } } },
      { toolCall: { name: "search_scenes", args: { query: "scene" } } },
      { content: "回答 [1]" },
    ]);

    if (stream) {
      const chunks: RagStreamChunk[] = [];
      for await (const chunk of streamRag(ENV, PARAMS)) chunks.push(chunk);
      expect(chunks.at(-1)).toMatchObject({ final: { citations: [{ video_id: 60 }] } });
    } else {
      const result = await runRag(ENV, PARAMS);
      expect(result.content).toBe("回答 [1]");
      expect(result.citations).toHaveLength(1);
    }

    expect(searchCalls).toEqual(["scene"]);
    expect(bodies).toHaveLength(3);
    expect(closed).toBe(1);
  });
});

describe.each([false, true])("Ollama 互換 API（stream=%s）", (stream) => {
  it("/v1/chat/completions でツール検索から引用付き回答まで実行する", async () => {
    hitsByQuery = () => [scene(1)];
    const bodies = stubOpenAi([
      { toolCall: { name: "search_scenes", args: { query: "scene" } } },
      { content: "回答 [1]" },
    ]);
    const fetchStub = vi.fn(fetch);
    vi.stubGlobal("fetch", fetchStub);
    const env = {
      ...ENV,
      OPENAI_API_KEY: "ollama",
      OPENAI_BASE_URL: "http://127.0.0.1:11434/v1/",
      LLM_MODEL: "qwen3-vl:8b-instruct",
    };

    if (stream) {
      const chunks: RagStreamChunk[] = [];
      for await (const chunk of streamRag(env, PARAMS)) chunks.push(chunk);
      expect(chunks.filter((chunk) => "text" in chunk).map((chunk) => chunk.text).join(""))
        .toBe("回答 [1]");
      expect(chunks.at(-1)).toMatchObject({ final: { citations: [{ video_id: 60 }] } });
    } else {
      const result = await runRag(env, PARAMS);
      expect(result.content).toBe("回答 [1]");
      expect(result.citations).toHaveLength(1);
    }

    expect(fetchStub).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchStub.mock.calls) {
      expect(url).toBe("http://127.0.0.1:11434/v1/chat/completions");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer ollama");
    }
    for (const body of bodies) {
      expect(body.model).toBe(env.LLM_MODEL);
      expect(body.stream).toBe(false);
      const messages = body.messages as { role: string; content: unknown }[];
      expect(typeof messages.find((message) => message.role === "system")?.content).toBe("string");
    }
    expect(searchCalls).toEqual(["scene"]);
    expect(closed).toBe(1);
  });
});

describe("RAG エージェント（非ストリーミング）", () => {
  it("search_scenes を呼んでから回答し、ヒットを citations に載せる", async () => {
    hitsByQuery = () => [scene(1), scene(2, 61)];
    const bodies = stubOpenAi([
      { toolCall: { name: "search_scenes", args: { query: "pgvector 定義" } } },
      { content: "pgvector は [1] と [2] の通りです。" },
    ]);

    const result = await runRag(ENV, PARAMS);

    expect(searchCalls).toEqual(["pgvector 定義"]);
    expect(result.content).toBe("pgvector は [1] と [2] の通りです。");
    expect(result.citations).toEqual([
      { video_id: 60, title: "Video 60", start_time: "00:01:00", end_time: "00:01:30" },
      { video_id: 61, title: "Video 61", start_time: "00:02:00", end_time: "00:02:30" },
    ]);
    expect(result.retrievedContexts).toEqual(["scene 1", "scene 2"]);
    expect(closed).toBe(1);

    // 1 通目に search_scenes がツールとして渡っている。
    const tools = bodies[0].tools as { function: { name: string; parameters: unknown } }[];
    expect(tools.map((t) => t.function.name)).toEqual(["search_scenes"]);
    // 所有者スコープは非公開。動画IDは講座内でのみ指定できる。
    expect(JSON.stringify(tools[0].function.parameters)).not.toContain("user_id");
    expect(JSON.stringify(tools[0].function.parameters)).toContain("video_ids");
  });

  it("複数クエリのヒットは重複排除し、[N] は回答全体で通し番号になる", async () => {
    // 1 回目と 2 回目で scene(1) が重複する。
    hitsByQuery = (query) => (query === "A" ? [scene(1), scene(2)] : [scene(1), scene(3)]);
    stubOpenAi([
      { toolCall: { name: "search_scenes", args: { query: "A" } } },
      { toolCall: { name: "search_scenes", args: { query: "B" } } },
      { content: "答え [1][2][3]" },
    ]);

    const result = await runRag(ENV, PARAMS);

    expect(searchCalls).toEqual(["A", "B"]);
    expect(result.citations).toHaveLength(3);
    expect(result.citations?.map((c) => c.start_time)).toEqual([
      "00:01:00",
      "00:02:00",
      "00:03:00",
    ]);
    expect(result.retrievedContexts).toEqual(["scene 1", "scene 2", "scene 3"]);
  });

  it("検索回数は MAX_SCENE_SEARCHES で打ち切り、回答は返す", async () => {
    hitsByQuery = () => [scene(1)];
    stubOpenAi([
      { toolCall: { name: "search_scenes", args: { query: "q1" } } },
      { toolCall: { name: "search_scenes", args: { query: "q2" } } },
      { toolCall: { name: "search_scenes", args: { query: "q3" } } },
      { toolCall: { name: "search_scenes", args: { query: "q4" } } },
      { content: "打ち切り後の回答 [1]" },
    ]);

    const result = await runRag(ENV, PARAMS);

    expect(searchCalls).toHaveLength(MAX_SCENE_SEARCHES);
    expect(result.content).toBe("打ち切り後の回答 [1]");
    expect(closed).toBe(1);
  });

  it("course が無い場合は検索せず単発の LLM 呼び出しになる", async () => {
    hitsByQuery = () => [];
    const bodies = stubOpenAi([{ content: "範囲外です。" }]);

    const result = await runRag(ENV, { ...PARAMS, videoIds: null });

    expect(searchCalls).toEqual([]);
    expect(closed).toBe(0);
    expect(result.citations).toBeNull();
    expect(bodies[0].tools).toBeUndefined();
  });
});

describe("RAG エージェント（ストリーミング）", () => {
  it("進捗の送信を途中で打ち切った場合も実行中の検索を中断する", async () => {
    const started = Promise.withResolvers<void>();
    const search = Promise.withResolvers<SceneHit[]>();
    hitsByQuery = () => {
      searchSignal!.addEventListener("abort", () => search.reject(searchSignal!.reason), { once: true });
      started.resolve();
      return search.promise;
    };
    const bodies = stubOpenAi([
      { toolCall: { name: "search_scenes", args: { query: "scene" } } },
      { content: "生成してはいけない回答" },
    ]);
    const stream = streamRag(ENV, PARAMS);
    try {
      expect((await stream.next()).value).toEqual({ searching: "scene", searchId: 1 });
      await started.promise;
      await stream.return();
      expect(searchSignal?.aborted).toBe(true);
      expect(bodies).toHaveLength(1);
      expect(closed).toBe(1);
    } finally {
      search.resolve([]);
      await stream.return();
    }
  });

  it.each(["deadline", "client"])("検索中の %s 中断を検索接続にも渡し、次のモデルを呼ばない", async (source) => {
    const deadline = new AbortController();
    const client = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    const started = Promise.withResolvers<void>();
    const search = Promise.withResolvers<SceneHit[]>();
    hitsByQuery = () => {
      searchSignal?.addEventListener("abort", () => search.reject(searchSignal!.reason), { once: true });
      started.resolve();
      return search.promise;
    };
    const bodies = stubOpenAi([
      { toolCall: { name: "search_scenes", args: { query: "scene" } } },
      { content: "生成してはいけない回答" },
    ]);
    const chunks: RagStreamChunk[] = [];
    const consume = (async () => {
      for await (const chunk of streamRag(ENV, PARAMS, client.signal)) chunks.push(chunk);
    })();
    const rejected = expect(consume).rejects.toThrow();
    try {
      await started.promise;
      if (source === "deadline") deadline.abort(new DOMException("deadline reached", "TimeoutError"));
      else client.abort();
      expect(searchSignal?.aborted).toBe(true);
    } finally {
      search.resolve([]);
      await rejected;
    }
    expect(bodies).toHaveLength(1);
    expect(closed).toBe(1);
    expect(chunks.some((chunk) => "text" in chunk || "final" in chunk)).toBe(false);
  });

  it.each(["deadline", "client"])("検索後の本文受信中も %s で中断し、本文・final を送らず接続を閉じる", async (source) => {
    hitsByQuery = () => [scene(1)];
    const deadline = new AbortController();
    const client = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    stubOpenAi([
      { toolCall: { name: "search_scenes", args: { query: "scene" } } },
    ]);
    const initialFetch = fetch;
    let upstream: AbortSignal | undefined;
    const reading = Promise.withResolvers<void>();
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (!body.messages.some((message: { role: string }) => message.role === "tool")) {
        return initialFetch(url, init);
      }
      upstream = init.signal!;
      return stalledChatResponse(upstream, reading.resolve, false);
    });
    const chunks: RagStreamChunk[] = [];
    const consume = (async () => {
      for await (const chunk of streamRag(ENV, PARAMS, client.signal)) chunks.push(chunk);
    })();
    const rejected = expect(consume).rejects.toThrow();
    await reading.promise;
    if (source === "deadline") deadline.abort(new DOMException("deadline reached", "TimeoutError"));
    else client.abort();
    await rejected;
    expect(upstream?.aborted).toBe(true);
    expect(timeout).toHaveBeenCalledWith(LLM_STREAM_TIMEOUT_MS);
    expect(chunks.some((chunk) => "text" in chunk || "final" in chunk)).toBe(false);
    expect(searchCalls).toEqual(["scene"]);
    expect(closed).toBe(1);
  });

  it("複数の検索ターンの前置きを除外し、最終回答だけを返す", async () => {
    hitsByQuery = () => [scene(1)];
    stubOpenAi([
      { toolCall: { name: "search_scenes", args: { query: "A" } }, preamble: "調べますね。" },
      { toolCall: { name: "search_scenes", args: { query: "B" } }, preamble: "追加で調べます。" },
      { content: "最終回答 [1]" },
    ]);
    const chunks: RagStreamChunk[] = [];
    for await (const chunk of streamRag(ENV, PARAMS)) chunks.push(chunk);
    expect(chunks.filter((chunk) => "text" in chunk).map((chunk) => chunk.text).join(""))
      .toBe("最終回答 [1]");
    expect(chunks.filter((chunk) => "searching" in chunk))
      .toEqual([{ searching: "A", searchId: 1 }, { searching: "B", searchId: 2 }]);
    expect(chunks.at(-1)).toMatchObject({ final: { citations: [{ video_id: 60 }] } });
    expect(closed).toBe(1);
  });

  it("検索イベント → 回答本文 → final の順に流す", async () => {
    hitsByQuery = () => [scene(1)];
    stubOpenAi(
      [
        { toolCall: { name: "search_scenes", args: { query: "検索語" } } },
        { content: "回答本文" },
      ],
    );

    const chunks: unknown[] = [];
    for await (const chunk of streamRag(ENV, PARAMS)) chunks.push(chunk);

    const searching = chunks.filter((c) => typeof c === "object" && c !== null && "searching" in c);
    expect(searching).toEqual([{ searching: "検索語", searchId: 1 }]);
    expect(chunks).toContainEqual({ searchCompleted: { id: 1, query: "検索語", count: 1 } });

    const text = chunks
      .filter((c): c is { text: string } => typeof c === "object" && c !== null && "text" in c)
      .map((c) => c.text)
      .join("");
    expect(text).toBe("回答本文");

    const last = chunks[chunks.length - 1] as { final: { citations: unknown[] } };
    expect(last.final.citations).toHaveLength(1);
    expect(closed).toBe(1);
  });

  it("検索が終わる前に開始を通知し、完了後に候補数を通知する", async () => {
    let finishSearch!: (hits: SceneHit[]) => void;
    hitsByQuery = () => new Promise<SceneHit[]>((resolve) => { finishSearch = resolve; });
    stubOpenAi([
      { toolCall: { name: "search_scenes", args: { query: "時間のかかる検索" } } },
      { content: "回答 [1]" },
    ]);
    const stream = streamRag(ENV, PARAMS);
    try {
      const first = await stream.next();
      expect(first.value).toEqual({ searching: "時間のかかる検索", searchId: 1 });
      finishSearch([scene(1)]);
      const remaining: RagStreamChunk[] = [];
      for await (const chunk of stream) remaining.push(chunk);
      expect(remaining[0]).toEqual({ searchCompleted: { id: 1, query: "時間のかかる検索", count: 1 } });
      expect(remaining.at(-1)).toHaveProperty("final");
    } finally {
      finishSearch?.([]);
      await stream.return();
    }
  });
});

describe.each([false, true])("講座メタ情報（stream=%s）", (streaming) => {
  const execute = async (overrides: Partial<Parameters<typeof runRag>[1]> = {}) => {
    const params = { ...PARAMS, courseId: 3, ...overrides };
    if (!streaming) return runRag(ENV, params);
    const chunks: RagStreamChunk[] = [];
    for await (const chunk of streamRag(ENV, params)) chunks.push(chunk);
    const final = chunks.find((chunk) => "final" in chunk);
    return {
      ...final!.final,
      content: chunks.filter((chunk) => "text" in chunk).map((chunk) => chunk.text).join(""),
    };
  };
  const toolResults = (body: Record<string, unknown>) =>
    (body.messages as { role: string; content: string }[])
      .filter((message) => message.role === "tool").map((message) => message.content);

  it("メタ情報だけで回答し、検索接続を開かず、機密情報や架空の引用を根拠に含めない", async () => {
    const bodies = stubOpenAi([
      { toolCall: { name: "get_course_info", args: {} }, preamble: "確認します。" },
      { content: "デジタル回路は2本の動画で構成されています。" },
    ]);
    const result = await execute({ messages: [{ role: "user", content: "この講座の名前と動画数は？" }] });
    expect(result.content).toBe("デジタル回路は2本の動画で構成されています。");
    expect(result.citations).toBeNull();
    expect(opened).toBe(0);
    expect(closed).toBe(0);
    expect(searchCalls).toEqual([]);
    expect(getCourseInfo).toHaveBeenCalledWith(ENV, 3, PARAMS.ownerUserId, {
      videoLimit: 20, videoOffset: 0,
      courseDescriptionLimit: COURSE_DESCRIPTION_LIMIT,
      videoDescriptionLimit: VIDEO_DESCRIPTION_LIMIT,
    });
    const context = JSON.parse(toolResults(bodies[1])[0]);
    expect(context).toMatchObject({ name: COURSE.name, video_count: 2,
      videos: [{ id: 60, position: 1, order: 0 }, { id: 61, position: 2, order: 10 }],
      videos_meta: { total: 2, has_more: false, next_offset: null },
    });
    expect(result.retrievedContexts).toHaveLength(1);
    expect(result.retrievedContexts[0]).toContain("Course metadata");
    for (const secret of ["private-share-token", "signed-url", PARAMS.ownerUserId]) {
      expect(JSON.stringify(bodies)).not.toContain(secret);
      expect(JSON.stringify(result)).not.toContain(secret);
    }
  });

  it.each(["empty", "processing"])("%s の講座でも説明未登録と本数・処理状態を取得できる", async (state) => {
    vi.mocked(getCourseInfo).mockResolvedValue({ ...COURSE, description: "",
      video_count: state === "empty" ? 0 : 1,
      videos: state === "empty" ? [] : [{ ...COURSE.videos[0], description: "", status: "processing" }],
    });
    const bodies = stubOpenAi([
      { toolCall: { name: "get_course_info", args: {} } },
      { content: "説明文は登録されていません。" },
    ]);
    const result = await execute({ videoIds: state === "empty" ? [] : [60] });
    expect(result.content).toBe("説明文は登録されていません。");
    const metadata = JSON.parse(toolResults(bodies[1])[0]);
    expect(metadata.description).toBe("");
    expect(metadata.video_count).toBe(state === "empty" ? 0 : 1);
    if (state === "processing") expect(metadata.videos[0].status).toBe("processing");
    expect(opened).toBe(0);
  });

  it("2ページ目で特定した動画を指定して検索し、シーン引用を保持する", async () => {
    vi.mocked(getCourseInfo)
      .mockResolvedValueOnce({ ...COURSE, videos: [COURSE.videos[0]] })
      .mockResolvedValueOnce({ ...COURSE, videos: [COURSE.videos[1]] });
    hitsByQuery = () => [scene(1, 61)];
    const bodies = stubOpenAi([
      { toolCall: { name: "get_course_info", args: { video_limit: 1 } } },
      { toolCall: { name: "get_course_info", args: { video_limit: 1, video_offset: 1 } } },
      { toolCall: { name: "search_scenes", args: { query: "回路の説明", video_ids: [61] } } },
      { content: "第8回の説明です [1]。" },
    ]);
    const result = await execute();
    expect(JSON.parse(toolResults(bodies[1])[0])).toMatchObject({
      video_count: 2, videos_meta: { total: 2, has_more: true, next_offset: 1 },
    });
    expect(JSON.parse(toolResults(bodies[2])[1])).toMatchObject({
      videos: [{ id: 61, position: 2 }], videos_meta: { total: 2, has_more: false, next_offset: null },
    });
    expect(videoSelections).toEqual([[61]]);
    expect(result.citations).toEqual([{ video_id: 61, title: "Video 61", start_time: "00:01:00", end_time: "00:01:30" }]);
    expect(result.retrievedContexts).toHaveLength(3);
    expect(opened).toBe(1);
    expect(closed).toBe(1);
  });

  it.each([[999], [60, 999], [], [-1]].map((video_ids) => ({ video_ids })))
    ("不正な動画指定 $video_ids を検索せずモデルへ返す", async ({ video_ids }) => {
    stubOpenAi([
      { toolCall: { name: "search_scenes", args: { query: "private", video_ids } } },
      { content: "指定された動画を検索できません。" },
    ]);
    const result = await execute();
    expect(result.citations).toBeNull();
    expect(opened).toBe(0);
    expect(searchCalls).toEqual([]);
  });

  it("モデル引数による講座ID差し替えを受け付けず、正しい引数で再試行できる", async () => {
    stubOpenAi([
      { toolCall: { name: "get_course_info", args: { course_id: 999 } } },
      { toolCall: { name: "get_course_info", args: {} } },
      { content: "デジタル回路です。" },
    ]);
    await execute();
    expect(getCourseInfo).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getCourseInfo).mock.calls[0][1]).toBe(3);
  });

  it("長い説明文を上限で切り、取得済み根拠にも省略を明示する", async () => {
    vi.mocked(getCourseInfo).mockResolvedValue({ ...COURSE,
      description: "あ".repeat(COURSE_DESCRIPTION_LIMIT + 1),
      videos: [{ ...COURSE.videos[0], description: "い".repeat(VIDEO_DESCRIPTION_LIMIT + 1) }],
    });
    const bodies = stubOpenAi([
      { toolCall: { name: "get_course_info", args: {} } }, { content: "説明の一部です。" },
    ]);
    await execute();
    const metadata = JSON.parse(toolResults(bodies[1])[0]);
    expect(metadata.description).toHaveLength(COURSE_DESCRIPTION_LIMIT);
    expect(metadata.description_truncated).toBe(true);
    expect(metadata.videos[0].description).toHaveLength(VIDEO_DESCRIPTION_LIMIT);
    expect(metadata.videos[0].description_truncated).toBe(true);
  });

  it("取得回数を制限し、最終回答を返す", async () => {
    stubOpenAi([
      ...Array.from({ length: MAX_COURSE_INFO_CALLS + 1 }, (): Turn => ({
        toolCall: { name: "get_course_info", args: {} },
      })),
      { content: "取得済みの講座情報です。" },
    ]);
    const result = await execute();
    expect(getCourseInfo).toHaveBeenCalledTimes(MAX_COURSE_INFO_CALLS);
    expect(result.content).toBe("取得済みの講座情報です。");
    expect(result.retrievedContexts).toHaveLength(1);
  });

  it("引数不備が続いても最終ターンはツールを外して回答させる", async () => {
    const bodies = stubOpenAi([
      ...Array.from({ length: MAX_TOOL_ROUNDS }, (): Turn => ({
        toolCall: { name: "get_course_info", args: { video_limit: 999 } },
      })),
      { content: "講座情報を取得できませんでした。" },
    ]);
    const result = await execute();
    expect(result.content).toBe("講座情報を取得できませんでした。");
    expect(bodies.at(-1)?.tools ?? []).toEqual([]);
    expect(getCourseInfo).not.toHaveBeenCalled();
    expect(opened).toBe(0);
  });

  it("メタ情報取得のDB障害では回答を生成せず例外を伝える", async () => {
    vi.mocked(getCourseInfo).mockRejectedValue(new Error("database unavailable"));
    const bodies = stubOpenAi([
      { toolCall: { name: "get_course_info", args: {} }, preamble: "確認します。" },
      { content: "誤った成功回答" },
    ]);
    await expect(execute()).rejects.toThrow(LlmProviderError);
    expect(bodies).toHaveLength(1);
    expect(opened).toBe(0);
  });
});
