import {
  DEFAULT_EMBEDDING_MODEL,
  LlmProviderError,
  openAiBaseUrl,
  resolveOpenAiKey,
  throwForResponse,
} from "./openai";
import type { Bindings } from "../types/bindings";

/**
 * クエリ埋め込み（Django `OpenAIEmbeddings(model=EMBEDDING_MODEL)` 相当）。
 * 次元は指定しない（モデル既定 = 本番 1536）。pgvector 側の列次元と一致している前提。
 */
export async function embedQuery(env: Bindings, text: string): Promise<number[]> {
  const apiKey = resolveOpenAiKey(env, "OpenAI embeddings");
  const model = env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;

  const res = await fetch(`${openAiBaseUrl(env)}/embeddings`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: text, encoding_format: "float" }),
  });
  if (!res.ok) await throwForResponse(res);

  const json = (await res.json()) as { data?: { embedding?: number[] }[] };
  const embedding = json.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new LlmProviderError("OpenAI embeddings response did not contain an embedding.");
  }
  return embedding;
}

/** pgvector のリテラル表現（PoC #01c: 文字列 + `::vector` キャストで param 渡し可）。 */
export const toVectorLiteral = (embedding: readonly number[]): string =>
  `[${embedding.join(",")}]`;
