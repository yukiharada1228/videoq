import { embedding as testEmbedding } from "./helpers/embedding";
import { describe, it, expect, afterEach, vi } from "vitest";
import { generateReply, streamReply, LLM_STREAM_TIMEOUT_MS } from "../src/lib/llm";
import { stalledChatResponse } from "./helpers/stalled-chat-response";
import { embedQuery } from "../src/lib/embeddings";
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

const modelAnswer = { segments: [{ text: "answer", sourceIds: [] }] };
const completion = (content = JSON.stringify(modelAnswer), finish_reason = "stop", refusal?: string) => ({
  choices: [{ finish_reason, message: { role: "assistant", content, ...(refusal ? { refusal } : {}) } }],
});
const frame = (content: string, finish_reason: string | null = null) => `data: ${JSON.stringify({ choices: [{ delta: { role: "assistant", content }, finish_reason }] })}\n\n`;
const frames = () => [frame(JSON.stringify(modelAnswer)), frame("", "stop"), "data: [DONE]\n\n"];

describe("native structured LLM output", () => {
  it.each(["local-codex-model", "gpt-5.4-pro", "gpt-4o-mini", "gpt-6-luna"])("%s uses strict json_schema with no conversion call", async (model) => {
    const calls: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      expect(String(url)).toBe("https://openai.test/v1/chat/completions");
      const body = JSON.parse(String(init.body));
      calls.push(body);
      expect(body).toMatchObject({ model,
        response_format: { type: "json_schema", json_schema: { strict: true } },

      });
      if (model === "gpt-6-luna") {
        expect(body).toMatchObject({ reasoning_effort: "none", max_completion_tokens: 1024 });
        expect(body).not.toHaveProperty("max_tokens");
      } else {
        expect(body).not.toHaveProperty("reasoning_effort");
      }
      return body.stream ? sseResponse(frames()) : jsonResponse(completion());
    });
    expect(await generateReply({ ...ENV, LLM_MODEL: model }, "SYS", "Q")).toEqual(modelAnswer);
    const chunks = [];
    for await (const chunk of streamReply({ ...ENV, LLM_MODEL: model }, "SYS", "Q")) chunks.push(chunk);
    expect(chunks).toEqual([{ segmentIndex: 0, text: "answer" }, { answer: modelAnswer }]);
    expect(calls).toHaveLength(2);
  });
  it("joins split SSE frames and emits text before completion", async () => {
    const first = frame('{"segments":[{"text":"Hel');
    const second = frame('lo","sourceIds":[]}]}');
    vi.stubGlobal("fetch", async () => sseResponse([first, second.slice(0, 10), second.slice(10), frame("", "stop"), "data: [DONE]\n\n"]));
    const chunks = [];
    for await (const chunk of streamReply(ENV, "S", "Q")) chunks.push(chunk);
    expect(chunks).toEqual([{ segmentIndex: 0, text: "Hel" }, { segmentIndex: 0, text: "lo" }, { answer: { segments: [{ text: "Hello", sourceIds: [] }] } }]);
  });
  it("aborts the upstream when the consumer stops after receiving text", async () => {
    let upstream: AbortSignal | undefined;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      upstream = init.signal!;
      return stalledChatResponse(upstream, () => {}, true, '{"segments":[{"text":"First');
    });
    const stream = streamReply(ENV, "S", "Q");
    try {
      expect((await stream.next()).value).toEqual({ segmentIndex: 0, text: "First" });
      await stream.return();
      expect(upstream?.aborted).toBe(true);
    } finally { await stream.return(); }
  });
  it.each(["deadline", "client"])("propagates %s cancellation while receiving the body", async (source) => {
    const deadline = new AbortController();
    const client = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    let upstream: AbortSignal | undefined;
    const reading = Promise.withResolvers<void>();
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      upstream = init.signal!;
      return stalledChatResponse(upstream, reading.resolve);
    });
    const consume = (async () => { for await (const chunk of streamReply(ENV, "S", "Q", client.signal)) void chunk; })();
    const rejected = expect(consume).rejects.toThrow();
    await reading.promise;
    if (source === "deadline") deadline.abort(new DOMException("deadline reached", "TimeoutError"));
    else client.abort();
    await rejected;
    expect(upstream?.aborted).toBe(true);
    expect(timeout).toHaveBeenCalledWith(LLM_STREAM_TIMEOUT_MS);
  });
  it.each([
    ["not JSON", "stop", undefined], [JSON.stringify(modelAnswer), "length", undefined],
    [JSON.stringify(modelAnswer), "stop", "refused"], ["", "content_filter", undefined],
  ])("rejects malformed, truncated or refused answers without retry", async (content, reason, refusal) => {
    const fetch = vi.fn(async () => jsonResponse(completion(content, reason, refusal)));
    vi.stubGlobal("fetch", fetch);
    await expect(generateReply(ENV, "S", "Q")).rejects.toThrow(LlmProviderError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects a stream without an explicit successful finish", async () => {
    vi.stubGlobal("fetch", async () => sseResponse([frame(JSON.stringify(modelAnswer)), "data: [DONE]\n\n"]));
    const consume = async () => { for await (const chunk of streamReply(ENV, "S", "Q")) void chunk; };
    await expect(consume()).rejects.toThrow(LlmProviderError);
  });
  it.each(["refusal", "length", "content_filter"])("rejects a %s stream after partial text without repairing it", async reason => {
    const delta = reason === "refusal" ? { refusal: "refused" } : {};
    const end = `data: ${JSON.stringify({ choices: [{ delta, finish_reason: reason === "refusal" ? "stop" : reason }] })}\n\n`;
    const fetch = vi.fn(async () => sseResponse([frame(JSON.stringify(modelAnswer)), end, "data: [DONE]\n\n"]));
    vi.stubGlobal("fetch", fetch);
    const chunks = [];
    const consume = async () => { for await (const chunk of streamReply(ENV, "S", "Q")) chunks.push(chunk); };
    await expect(consume()).rejects.toThrow(LlmProviderError);
    expect(chunks).toEqual([{ segmentIndex: 0, text: "answer" }]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("reports unsupported providers and authentication errors without fallback", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({ error: "json_schema unsupported" }, 400));
    await expect(generateReply(ENV, "S", "Q")).rejects.toThrow(LlmConfigurationError);
    vi.stubGlobal("fetch", async () => jsonResponse({ error: "nope" }, 401));
    await expect(generateReply(ENV, "S", "Q")).rejects.toThrow(LlmConfigurationError);
    vi.stubGlobal("fetch", async () => jsonResponse({ error: "boom" }, 500));
    await expect(generateReply(ENV, "S", "Q")).rejects.toThrow(LlmProviderError);
  });
  it("requires an API key", async () => {
    await expect(generateReply({} as Bindings, "S", "Q")).rejects.toThrow(LlmConfigurationError);
    await expect(embedQuery({} as Bindings, "q")).rejects.toThrow(LlmConfigurationError);
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

  it("text-embedding-3-small に単一テキストを送り、埋め込みを取得する", async () => {
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
    expect(v).toEqual(testEmbedding(0.5, -0.25, 0));
  });

  it("空レスポンスはプロバイダエラー", async () => {
    vi.stubGlobal("fetch", async () => jsonResponse({ data: [] }));
    await expect(embedQuery(ENV, "hello")).rejects.toThrow(LlmProviderError);
  });
});
