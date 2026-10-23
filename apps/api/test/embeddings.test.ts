import { afterEach, describe, expect, it, vi } from "vitest";
import { embedQuery } from "../src/lib/embeddings";
import { EMBEDDING_DIMENSIONS, resolveEmbeddingConfig, validateEmbedding } from "../src/lib/embedding-contract";
import { assertEmbeddingSchema } from "../src/lib/embedding-schema";
import type { Bindings } from "../src/types/bindings";
import { embedding } from "./helpers/embedding";
import { embeddingConfigCases } from "./helpers/embedding-config";

const baseEnv = { OPENAI_API_KEY: "test-key" } as Bindings;
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("embedding contract", () => {
  it("has fixed 1536 dimensions", () => {
    expect(EMBEDDING_DIMENSIONS).toBe(1536);
  });
  it.each(embeddingConfigCases)("resolves $env", (testCase) => {
    if (testCase.error) {
      expect(() => resolveEmbeddingConfig(testCase.env)).toThrowError(expect.objectContaining({ reason: testCase.error }));
    } else {
      expect(resolveEmbeddingConfig(testCase.env)).toEqual(testCase.expected);
    }
  });
  it.each([
    [], [1, 2], Array(2560).fill(1), Array(1536).fill(0),
    ["1", ...embedding(1).slice(1)], [true, ...embedding(1).slice(1)],
    embedding(NaN), embedding(Infinity), embedding(1e300), embedding(1e-300), null,
  ].map((vector) => ({ vector })))("rejects invalid vector %#", ({ vector }) => {
    expect(() => validateEmbedding(vector)).toThrowError(expect.objectContaining({ reason: "EMBEDDING_OUTPUT_INVALID" }));
  });
});

describe("embedQuery", () => {
  it("routes embeddings to their own endpoint and credential without changing chat settings", async () => {
    const fetch = vi.fn(async () => Response.json({ data: [{ index: 0, embedding: embedding(1) }] }));
    vi.stubGlobal("fetch", fetch);
    const env = { ...baseEnv, OPENAI_BASE_URL: "http://chat.test/v1", EMBEDDING_BASE_URL: "http://embed.test/v1/", EMBEDDING_API_KEY: "embedding-key" };
    await embedQuery(env, "private query");
    expect(fetch).toHaveBeenCalledWith("http://embed.test/v1/embeddings", expect.objectContaining({
      headers: expect.objectContaining({ authorization: "Bearer embedding-key" }),
    }));
    expect(env.OPENAI_BASE_URL).toBe("http://chat.test/v1");
  });

  it.each(["openai"].flatMap(provider => ["headers", "body"].map(stage => ({ provider, stage }))))
    ("stops $provider embedding requests during $stage when the caller aborts", async ({ provider, stage }) => {
    const controller = new AbortController();
    const reason = new DOMException("client disconnected", "AbortError");
    const started = Promise.withResolvers<void>();
    let upstream: AbortSignal | undefined;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      upstream = init.signal!;
      if (stage === "headers") return new Promise<Response>((_resolve, reject) => {
        upstream!.addEventListener("abort", () => reject(upstream!.reason), { once: true });
        started.resolve();
      });
      return new Response(new ReadableStream({
        start(body) {
          upstream!.addEventListener("abort", () => body.error(upstream!.reason), { once: true });
          started.resolve();
        },
      }), { headers: { "content-type": "application/json" } });
    });
    const pending = embedQuery({ ...baseEnv, EMBEDDING_PROVIDER: provider, EMBEDDING_MODEL: "model" }, "input", controller.signal);
    const rejected = expect(pending).rejects.toBe(reason);
    await started.promise;
    controller.abort(reason);
    expect(upstream?.aborted).toBe(true);
    await rejected;
  });

  it.each(["openai"])("requests and validates 1536 dimensions via %s", async (provider) => {
    const fetch = vi.fn(async () => Response.json({ data: [{ index: 0, embedding: embedding(1) }] }));
    vi.stubGlobal("fetch", fetch);
    const env = { ...baseEnv, EMBEDDING_PROVIDER: provider, EMBEDDING_MODEL: "text-embedding-3-small" } as Bindings;
    expect(await embedQuery(env, "hello")).toEqual(embedding(1));
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/embeddings");
    expect(JSON.parse(String(init.body))).toEqual({ model: env.EMBEDDING_MODEL, input: "hello", dimensions: 1536, encoding_format: "float" });
  });
  it.each([
    { data: [{ index: 1, embedding: embedding(1) }] },
    { data: [{ index: 0, embedding: embedding(1) }, { index: 0, embedding: embedding(1) }] },
    { data: [{ index: "0", embedding: embedding(1) }] },
    { data: [{ index: 0, embedding: [1, 2] }] }, null,
  ])("rejects invalid OpenAI responses %#", async (payload) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(payload)));
    await expect(embedQuery(baseEnv, "hello")).rejects.toMatchObject({ reason: "EMBEDDING_OUTPUT_INVALID" });
  });
  it("rejects the removed provider before any request instead of using a hosted fallback", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(embedQuery({ ...baseEnv, EMBEDDING_PROVIDER: "ollama", EMBEDDING_MODEL: "old-model" }, "private input"))
      .rejects.toMatchObject({ reason: "EMBEDDING_CONFIG_INVALID" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not retry without dimensions or accept an incompatible private model's native size", async () => {
    const fetch = vi.fn(async () => Response.json({ data: [{ index: 0, embedding: Array(2560).fill(0.1) }] }));
    vi.stubGlobal("fetch", fetch);
    await expect(embedQuery({ ...baseEnv, EMBEDDING_BASE_URL: "http://embedding.test/v1", EMBEDDING_MODEL: "wrong-size" }, "private input"))
      .rejects.toMatchObject({ reason: "EMBEDDING_OUTPUT_INVALID" });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each(["openai"])("does not expose provider response bodies or retry on %s errors", async (provider) => {
    const fetch = vi.fn(async () => new Response("private input / token", { status: 400 }));
    vi.stubGlobal("fetch", fetch);
    await expect(embedQuery({ ...baseEnv, EMBEDDING_PROVIDER: provider, EMBEDDING_MODEL: "model" } as Bindings, "input"))
      .rejects.toThrow(`OpenAI embeddings failed (HTTP 400).`);
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe("declared DB dimensions", () => {
  it.each([[], [{ type_name: "vector", dimensions: 1024 }], [{ type_name: "vector", dimensions: -1 }], [{ type_name: "text", dimensions: 1536 }]].map((rows) => ({ rows })))("rejects incompatible or missing columns %#", async ({ rows }) => {
    const query = vi.fn(async () => ({ rows }));
    await expect(assertEmbeddingSchema({ query }, { provider: "openai", model: "text-embedding-3-small" })).rejects.toMatchObject({ reason: "EMBEDDING_SCHEMA_MISMATCH" });
    expect(query.mock.calls[0][0]).toContain("pg_attribute");
  });
  it("accepts the declared vector(1536) without reading table contents", async () => {
    const query = vi.fn(async () => ({ rows: [{ type_name: "vector", dimensions: 1536 }] }));
    await assertEmbeddingSchema({ query }, resolveEmbeddingConfig({}));
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][1]).toEqual(["public.scene_embeddings"]);
  });
});
