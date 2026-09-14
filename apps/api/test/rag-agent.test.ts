import { describe, it, expect, afterEach, vi } from "vitest";
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
let hitsByQuery: (query: string) => SceneHit[] | Promise<SceneHit[]>;

vi.mock("../src/repositories/vector-repository", () => ({
  RETRIEVER_K: 20,
  openSceneSearch: async () => ({
    search: async (query: string) => {
      searchCalls.push(query);
      return hitsByQuery(query);
    },
    close: async () => {
      closed += 1;
    },
  }),
}));

const { runRag, streamRag, MAX_SCENE_SEARCHES } = await import("../src/lib/rag");

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
  courseContext: null,
};

const scene = (n: number, videoId = 60): SceneHit => ({
  content: `scene ${n}`,
  videoId,
  videoTitle: `Video ${videoId}`,
  startTime: `00:0${n}:00`,
  endTime: `00:0${n}:30`,
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
    return [
      ...(turn.preamble ? [
        `data: ${JSON.stringify({ choices: [{ delta: { role: "assistant", content: turn.preamble } }] })}\n\n`,
      ] : []),
      `data: ${JSON.stringify({
        choices: [
          {
            delta: {
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
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
      })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] })}\n\n`,
      "data: [DONE]\n\n",
    ];
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
function stubOpenAi(turns: Turn[], opts: { stream?: boolean } = {}) {
  const bodies: Record<string, unknown>[] = [];
  let index = 0;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    if (String(url).endsWith("/embeddings")) {
      return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    bodies.push(JSON.parse(String(init.body)));
    const turn = turns[Math.min(index++, turns.length - 1)];
    if ("status" in turn) {
      return new Response("upstream failed", { status: turn.status });
    }
    if (!opts.stream) {
      return new Response(JSON.stringify(jsonTurn(turn)), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const enc = new TextEncoder();
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          // 本文にはプロバイダの ID があるが、LangChain が生成する利用量チャンクは
          // 別の ID になる。同じターンとして扱い、本文を消さないことも検証する。
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
});

describe.each([false, true])("検索障害（stream=%s）", (stream) => {
  it.each([
    new LlmProviderError("Ollama embeddings unreachable"),
    new LlmConfigurationError("EMBEDDING_MODEL is required"),
    new Error("database unavailable"),
  ])("検索例外を通常回答にせず送出し、接続を閉じる: %s", async (error) => {
    hitsByQuery = () => {
      throw error;
    };
    stubOpenAi([
      { toolCall: { name: "search_scenes", args: { query: "scene" } }, preamble: "調べますね。" },
      { content: "検索できませんでした。" },
    ], { stream });

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
    expect(closed).toBe(1);
  });

  it("検索後のモデル呼び出しも失敗した場合に、元の設定エラーを保つ", async () => {
    const error = new LlmConfigurationError("EMBEDDING_MODEL is required");
    hitsByQuery = () => {
      throw error;
    };
    stubOpenAi([
      { toolCall: { name: "search_scenes", args: { query: "scene" } } },
      { status: 503 },
    ], { stream });

    const execute = async () => {
      if (!stream) return runRag(ENV, PARAMS);
      for await (const chunk of streamRag(ENV, PARAMS)) {
        expect(chunk).not.toHaveProperty("text");
        expect(chunk).not.toHaveProperty("final");
      }
    };
    await expect(execute()).rejects.toBe(error);
    expect(closed).toBe(1);
  });
});

describe.each([false, true])("Ollama 互換 API（stream=%s）", (stream) => {
  it("/v1/chat/completions でツール検索から引用付き回答まで実行する", async () => {
    hitsByQuery = () => [scene(1)];
    const bodies = stubOpenAi([
      { toolCall: { name: "search_scenes", args: { query: "scene" } } },
      { content: "回答 [1]" },
    ], { stream });
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
      expect(body.stream).toBe(stream);
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
    // フィルタ（user_id / video_id）はスキーマに露出しない。
    expect(JSON.stringify(tools[0].function.parameters)).not.toContain("user_id");
    expect(JSON.stringify(tools[0].function.parameters)).not.toContain("video_id");
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
  it.each(["deadline", "client"])("検索後の本文受信中も %s で中断し、本文・final を送らず接続を閉じる", async (source) => {
    hitsByQuery = () => [scene(1)];
    const deadline = new AbortController();
    const client = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    stubOpenAi([
      { toolCall: { name: "search_scenes", args: { query: "scene" } } },
    ], { stream: true });
    const initialFetch = fetch;
    let upstream: AbortSignal | undefined;
    const reading = Promise.withResolvers<void>();
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (!body.messages.some((message: { role: string }) => message.role === "tool")) {
        return initialFetch(url, init);
      }
      upstream = init.signal!;
      return stalledChatResponse(upstream, reading.resolve);
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
    ], { stream: true });
    const chunks: RagStreamChunk[] = [];
    for await (const chunk of streamRag(ENV, PARAMS)) chunks.push(chunk);
    expect(chunks.filter((chunk) => "text" in chunk).map((chunk) => chunk.text).join(""))
      .toBe("最終回答 [1]");
    expect(chunks.filter((chunk) => "searching" in chunk))
      .toEqual([{ searching: "A", searchId: 1 }, { searching: "B", searchId: 2 }]);
    expect(chunks.at(-1)).toMatchObject({ final: { citations: [{ video_id: 60 }] } });
    expect(closed).toBe(1);
  });

  it("検索イベント → 回答トークン → final の順に流す", async () => {
    hitsByQuery = () => [scene(1)];
    stubOpenAi(
      [
        { toolCall: { name: "search_scenes", args: { query: "検索語" } } },
        { content: "回答本文" },
      ],
      { stream: true },
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
    ], { stream: true });
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
