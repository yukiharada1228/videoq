import {
  LlmConfigurationError,
  LlmProviderError,
  openAiBaseUrl,
  resolveOpenAiKey,
} from "./openai";
import { deadlineSignal } from "./request-timeout";
import { EMBEDDING_DIMENSIONS, EmbeddingValidationError, resolveEmbeddingConfig, validateEmbedding, type EmbeddingConfig } from "./embedding-contract";

/**
 * 検索クエリの埋め込みベクトルを生成する。
 * OpenAI / Ollama both use the fixed 1536-dimensional storage contract.
 */

const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const EMBEDDING_TIMEOUT_MS = 30_000;

export type EmbeddingEnv = {
  EMBEDDING_PROVIDER?: string;
  EMBEDDING_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OLLAMA_BASE_URL?: string;
};

async function embedWithOpenAi(env: EmbeddingEnv, text: string, config: EmbeddingConfig): Promise<number[]> {
  const apiKey = resolveOpenAiKey(env, "OpenAI embeddings");
  const body: Record<string, unknown> = {
    model: config.model,
    input: text,
    encoding_format: "float",
    dimensions: EMBEDDING_DIMENSIONS,
  };

  let res: Response;
  try {
    res = await fetch(`${openAiBaseUrl(env)}/embeddings`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: deadlineSignal(EMBEDDING_TIMEOUT_MS),
    });
  } catch {
    throw new LlmProviderError("OpenAI embeddings request failed. Check the server connection.");
  }
  if (!res.ok) {
    await res.body?.cancel();
    if (res.status === 401) throw new LlmConfigurationError("Invalid OpenAI API key. Check the server configuration.");
    throw new LlmProviderError(`OpenAI embeddings failed (HTTP ${res.status}).`);
  }

  const json: unknown = await embeddingJson(res, config);
  if (!isRecord(json) || !Array.isArray(json.data) || json.data.length !== 1 ||
      !isRecord(json.data[0]) || json.data[0].index !== 0) {
    throw new EmbeddingValidationError("EMBEDDING_OUTPUT_INVALID", config);
  }
  return validateEmbedding(json.data[0].embedding, "EMBEDDING_OUTPUT_INVALID", config);
}

async function embedWithOllama(env: EmbeddingEnv, text: string, config: EmbeddingConfig): Promise<number[]> {
  const base = (env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL).replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/api/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: config.model, input: text, dimensions: EMBEDDING_DIMENSIONS }),
      signal: deadlineSignal(EMBEDDING_TIMEOUT_MS),
    });
  } catch {
    throw new LlmProviderError("Ollama embeddings request failed. Check the server connection.");
  }
  if (!res.ok) {
    await res.body?.cancel();
    throw new LlmProviderError(`Ollama embeddings failed (HTTP ${res.status}).`);
  }
  const json: unknown = await embeddingJson(res, config);
  if (!isRecord(json) || !Array.isArray(json.embeddings) || json.embeddings.length !== 1) {
    throw new EmbeddingValidationError("EMBEDDING_OUTPUT_INVALID", config);
  }
  return validateEmbedding(json.embeddings[0], "EMBEDDING_OUTPUT_INVALID", config);
}

export async function embedQuery(env: EmbeddingEnv, text: string): Promise<number[]> {
  const config = resolveEmbeddingConfig(env);
  return config.provider === "ollama" ? embedWithOllama(env, text, config) : embedWithOpenAi(env, text, config);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function embeddingJson(res: Response, config: EmbeddingConfig): Promise<unknown> {
  try { return await res.json(); }
  catch { throw new EmbeddingValidationError("EMBEDDING_OUTPUT_INVALID", config); }
}

/** pgvector のリテラル表現（文字列 + `::vector` キャストで param 渡し可）。 */
export const toVectorLiteral = (embedding: readonly number[]): string =>
  `[${embedding.join(",")}]`;
