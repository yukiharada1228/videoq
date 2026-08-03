import {
  DEFAULT_EMBEDDING_MODEL,
  LlmConfigurationError,
  LlmProviderError,
  openAiBaseUrl,
  resolveOpenAiKey,
  throwForResponse,
} from "./openai";
import type { Bindings } from "../types/bindings";

/**
 * 検索クエリの埋め込みベクトルを生成する。
 * - openai: OpenAI Embeddings API（既定モデル次元）。`dimensions` 指定可。
 * - ollama: ローカル Ollama `/api/embeddings`（ローカル DB が 1024 次元のときなど）。
 */

const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";

function embeddingProvider(env: Bindings): string {
  return (env.EMBEDDING_PROVIDER || "openai").trim().toLowerCase();
}

async function embedWithOpenAi(env: Bindings, text: string): Promise<number[]> {
  const apiKey = resolveOpenAiKey(env, "OpenAI embeddings");
  const model = env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
  const body: Record<string, unknown> = {
    model,
    input: text,
    encoding_format: "float",
  };
  const dims = Number(env.EMBEDDING_VECTOR_SIZE || "");
  if (Number.isFinite(dims) && dims > 0) {
    body.dimensions = dims;
  }

  const res = await fetch(`${openAiBaseUrl(env)}/embeddings`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await throwForResponse(res);

  const json = (await res.json()) as { data?: { embedding?: number[] }[] };
  const embedding = json.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new LlmProviderError("OpenAI embeddings response did not contain an embedding.");
  }
  return embedding;
}

async function embedWithOllama(env: Bindings, text: string): Promise<number[]> {
  const model = env.EMBEDDING_MODEL;
  if (!model) {
    throw new LlmConfigurationError(
      "EMBEDDING_MODEL is required when EMBEDDING_PROVIDER=ollama.",
    );
  }
  const base = (env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL).replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/api/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, prompt: text }),
    });
  } catch (e) {
    throw new LlmProviderError(
      `Ollama embeddings unreachable at ${base}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new LlmProviderError(
      `Ollama embeddings failed (${res.status}): ${body.slice(0, 500)}`,
    );
  }
  const json = (await res.json()) as { embedding?: number[] };
  if (!Array.isArray(json.embedding) || json.embedding.length === 0) {
    throw new LlmProviderError("Ollama embeddings response did not contain an embedding.");
  }
  return json.embedding;
}

export async function embedQuery(env: Bindings, text: string): Promise<number[]> {
  const provider = embeddingProvider(env);
  if (provider === "ollama") return embedWithOllama(env, text);
  if (provider === "openai") return embedWithOpenAi(env, text);
  throw new LlmConfigurationError(
    `Unsupported EMBEDDING_PROVIDER '${provider}'. Use 'openai' or 'ollama'.`,
  );
}

/** pgvector のリテラル表現（PoC #01c: 文字列 + `::vector` キャストで param 渡し可）。 */
export const toVectorLiteral = (embedding: readonly number[]): string =>
  `[${embedding.join(",")}]`;
