import { describe, expect, it, vi, afterEach } from "vitest";
import { embedQuery, toVectorLiteral } from "../src/lib/embeddings";
import type { Bindings } from "../src/types/bindings";

const baseEnv = {
  ENVIRONMENT: "development",
  CORS_ALLOW_ORIGIN: "http://localhost:3000",
  AUTH_JWT_SECRET: "x",
} as unknown as Bindings;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("embedQuery", () => {
  it("uses Ollama /api/embeddings when provider=ollama", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ embedding: [0.1, 0.2, 0.3] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const vec = await embedQuery(
      {
        ...baseEnv,
        EMBEDDING_PROVIDER: "ollama",
        EMBEDDING_MODEL: "qwen3-embedding:0.6b",
        OLLAMA_BASE_URL: "http://127.0.0.1:11434",
      },
      "hello",
    );

    expect(vec).toEqual([0.1, 0.2, 0.3]);
    expect(toVectorLiteral(vec)).toBe("[0.1,0.2,0.3]");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:11434/api/embeddings");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      model: "qwen3-embedding:0.6b",
      prompt: "hello",
    });
  });
});
