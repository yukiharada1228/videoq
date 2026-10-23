import {
  LlmConfigurationError,
  LlmProviderError,
  openAiBaseUrl,
  resolveOpenAiKey,
} from "./openai";
import { deadlineSignal } from "./request-timeout";
import { EMBEDDING_DIMENSIONS, EmbeddingValidationError, resolveEmbeddingConfig, validateEmbedding, type EmbeddingConfig } from "./embedding-contract";
import type { AnswerCostLedger } from "./answer-cost-ledger";

/**
 * 検索クエリの埋め込みベクトルを生成する。
 * Hosted and private OpenAI-compatible APIs use the same 1536-dimensional contract.
 */

const EMBEDDING_TIMEOUT_MS = 30_000;

export type EmbeddingEnv = {
  EMBEDDING_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  EMBEDDING_BASE_URL?: string;
  EMBEDDING_API_KEY?: string;
};

async function embedWithOpenAi(env: EmbeddingEnv, text: string, config: EmbeddingConfig, signal?: AbortSignal, costLedger?: AnswerCostLedger): Promise<number[]> {
  const apiKey = resolveOpenAiKey({ OPENAI_API_KEY: env.EMBEDDING_API_KEY || env.OPENAI_API_KEY }, "OpenAI-compatible embeddings");
  const call = costLedger?.begin("query_embedding", config.model);
  try {
    const body: Record<string, unknown> = {
      model: config.model,
      input: text,
      encoding_format: "float",
      dimensions: EMBEDDING_DIMENSIONS,
    };

    let res: Response;
    try {
      res = await fetch(`${openAiBaseUrl({ OPENAI_BASE_URL: env.EMBEDDING_BASE_URL || env.OPENAI_BASE_URL })}/embeddings`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: deadlineSignal(EMBEDDING_TIMEOUT_MS, signal),
      });
    } catch {
      signal?.throwIfAborted();
      throw new LlmProviderError("OpenAI embeddings request failed. Check the server connection.");
    }
    if (!res.ok) {
      await res.body?.cancel();
      if (res.status === 401) throw new LlmConfigurationError("Invalid OpenAI API key. Check the server configuration.");
      throw new LlmProviderError(`OpenAI embeddings failed (HTTP ${res.status}).`);
    }

    const json: unknown = await embeddingJson(res, config, signal);
    if (isRecord(json)) call?.complete(json.usage);
    if (!isRecord(json) || !Array.isArray(json.data) || json.data.length !== 1 ||
        !isRecord(json.data[0]) || json.data[0].index !== 0) {
      throw new EmbeddingValidationError("EMBEDDING_OUTPUT_INVALID", config);
    }
    return validateEmbedding(json.data[0].embedding, "EMBEDDING_OUTPUT_INVALID", config);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") call?.interrupt();
    else call?.fail();
    throw error;
  }
}

export async function embedQuery(env: EmbeddingEnv, text: string, signal?: AbortSignal, costLedger?: AnswerCostLedger): Promise<number[]> {
  signal?.throwIfAborted();
  const config = resolveEmbeddingConfig(env);
  const result = await embedWithOpenAi(env, text, config, signal, costLedger);
  signal?.throwIfAborted();
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function embeddingJson(res: Response, config: EmbeddingConfig, signal?: AbortSignal): Promise<unknown> {
  try { return await res.json(); }
  catch {
    signal?.throwIfAborted();
    throw new EmbeddingValidationError("EMBEDDING_OUTPUT_INVALID", config);
  }
}
