import { embedding as testEmbedding } from "./helpers/embedding";
import { describe, it, expect, afterEach, vi } from "vitest";
import { generateReply, streamReply, LLM_STREAM_TIMEOUT_MS } from "../src/lib/llm";
import { stalledChatResponse } from "./helpers/stalled-chat-response";
import { embedQuery, toVectorLiteral } from "../src/lib/embeddings";
import { LlmConfigurationError, LlmProviderError } from "../src/lib/openai";
import type { Bindings } from "../src/types/bindings";

const ENV = {
  OPENAI_API_KEY: "sk-test",
  OPENAI_BASE_URL: "https://openai.test/v1",
} as unknown as Bindings;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const sseResponse = (frames: string[]) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        for (const f of frames) controller.enqueue(enc.encode(f));
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("LLM 呼び出し（ChatOpenAI 相当）", () => {
  it.each(["local-codex-model", "gpt-5.4-pro"])(
    "%s でも通常応答・ストリームを /chat/completions に送る", async (model) => {
      const urls: string[] = [];
      vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
        urls.push(String(url));
        const body = JSON.parse(String(init.body));
        expect(body.model).toBe(model);
        return body.stream
          ? sseResponse([
              'data: {"choices":[{"delta":{"role":"assistant","content":"answer"}}]}\n\n',
              "data: [DONE]\n\n",
            ])
          : jsonResponse({ choices: [{ message: { role: "assistant", content: "answer" } }] });
      });
      const env = { ...ENV, LLM_MODEL: model };
      expect(await generateReply(env, "SYS", "Q")).toBe("answer");
      const parts: string[] = [];
      for await (const text of streamReply(env, "SYS", "Q")) parts.push(text);
      expect(parts.join("")).toBe("answer");
      expect(urls).toEqual(Array(2).fill("https://openai.test/v1/chat/completions"));
    },
  );

  it.each(["deadline", "client"])("本文受信中も %s による中断を上流へ伝播する", async (source) => {
    const deadline = new AbortController();
    const client = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    let upstream: AbortSignal | undefined;
    const reading = Promise.withResolvers<void>();
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      upstream = init.signal!;
      return stalledChatResponse(upstream, reading.resolve);
    });
    const parts: string[] = [];
    const consume = (async () => {
      for await (const text of streamReply(ENV, "SYS", "Q", client.signal)) parts.push(text);
    })();
    const rejected = expect(consume).rejects.toThrow();
    await reading.promise;
    if (source === "deadline") deadline.abort(new DOMException("deadline reached", "TimeoutError"));
    else client.abort();
    await rejected;
    expect(upstream?.aborted).toBe(true);
    expect(timeout).toHaveBeenCalledWith(LLM_STREAM_TIMEOUT_MS);
  });

  it("非ストリーミングは gpt-4o-mini / temperature 0 / max_tokens 1024 で system+user のみ送る", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse({ choices: [{ message: { content: "answer" } }] });
    });

    const out = await generateReply(ENV, "SYS", "Q?");
    expect(out).toBe("answer");
    expect(calls[0].url).toBe("https://openai.test/v1/chat/completions");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body).toEqual({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 1024,
      stream: false,
      messages: [
        { role: "system", content: "SYS" },
        { role: "user", content: "Q?" },
      ],
    });
  });

  it("ストリーミングはフレーム分割・空 delta・[DONE] を正しく扱う", async () => {
    const chunk = (text: string) =>
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
    // 2 番目のフレームは途中で切れた状態で届く（バッファ結合の確認）
    const frames = [
      chunk("Hel"),
      `data: ${JSON.stringify({ choices: [{ delta: {} }] })}\n\n`,
      chunk("lo").slice(0, 10),
      chunk("lo").slice(10),
      "data: [DONE]\n\n",
    ];
    vi.stubGlobal("fetch", async () => sseResponse(frames));

    const parts: string[] = [];
    for await (const t of streamReply(ENV, "SYS", "Q?")) parts.push(t);
    expect(parts).toEqual(["Hel", "lo"]);
  });

  it("stream:true が送られる", async () => {
    let sent: Record<string, unknown> = {};
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sent = JSON.parse(init.body as string);
      return sseResponse(["data: [DONE]\n\n"]);
    });
    for await (const _ of streamReply(ENV, "S", "Q")) void _;
    expect(sent.stream).toBe(true);
  });

  it("AbortSignal を上流 fetch へ伝播する（クライアント切断で課金を止める）", async () => {
    let seen: AbortSignal | undefined;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      seen = init.signal ?? undefined;
      return sseResponse(["data: [DONE]\n\n"]);
    });

    const controller = new AbortController();
    for await (const _ of streamReply(ENV, "S", "Q", controller.signal)) void _;
    expect(seen).toBeDefined();
    controller.abort();
    expect(seen?.aborted).toBe(true);
  });

  it("401 は設定エラー、その他はプロバイダエラー", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({ error: "nope" }, 401));
    await expect(generateReply(ENV, "S", "Q")).rejects.toThrow(LlmConfigurationError);
    await expect(generateReply(ENV, "S", "Q")).rejects.toThrow(
      "Invalid OpenAI API key. Please check your API key in Settings.",
    );

    vi.stubGlobal("fetch", async () => jsonResponse({ error: "boom" }, 500));
    await expect(generateReply(ENV, "S", "Q")).rejects.toThrow(LlmProviderError);
  });

  it("APIキー未設定は設定エラー", async () => {
    const noKey = {} as unknown as Bindings;
    await expect(generateReply(noKey, "S", "Q")).rejects.toThrow(
      "OpenAI API key is required when using OpenAI LLM. " +
        "Please set OPENAI_API_KEY in the server environment.",
    );
    await expect(embedQuery(noKey, "q")).rejects.toThrow(
      "OpenAI API key is required when using OpenAI embeddings. " +
        "Please set OPENAI_API_KEY in the server environment.",
    );
  });
});

describe("埋め込み生成", () => {
  it("Ollama は専用エンドポイントとモデルを使い、OpenAI キーを必要としない", async () => {
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      expect(url).toBe("http://127.0.0.1:11434/api/embed");
      expect(JSON.parse(String(init.body))).toEqual({
        model: "qwen3-embedding:4b",
        input: "hello",
        dimensions: 1536,
      });
      expect(new Headers(init.headers).has("authorization")).toBe(false);
      return jsonResponse({ embeddings: [testEmbedding(0.5, -0.25, 0)] });
    });

    await expect(embedQuery({
      ...ENV,
      OPENAI_API_KEY: "",
      EMBEDDING_PROVIDER: "ollama",
      EMBEDDING_MODEL: "qwen3-embedding:4b",
      OLLAMA_BASE_URL: "http://127.0.0.1:11434/",
    }, "hello")).resolves.toEqual(testEmbedding(0.5, -0.25, 0));
  });

  it("text-embedding-3-small に単一テキストを送り、pgvector リテラル化できる", async () => {
    let sent: Record<string, unknown> = {};
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      expect(url).toBe("https://openai.test/v1/embeddings");
      sent = JSON.parse(init.body as string);
      return jsonResponse({ data: [{ index: 0, embedding: testEmbedding(0.5, -0.25, 0) }] });
    });

    const v = await embedQuery(ENV, "hello");
    expect(sent).toEqual({
      model: "text-embedding-3-small",
      input: "hello",
      encoding_format: "float",
      dimensions: 1536,
    });
    expect(toVectorLiteral(v)).toBe(JSON.stringify(testEmbedding(0.5, -0.25, 0)));
  });

  it("空レスポンスはプロバイダエラー", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({ data: [] }));
    await expect(embedQuery(ENV, "hello")).rejects.toThrow(LlmProviderError);
  });
});
