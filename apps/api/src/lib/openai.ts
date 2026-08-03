import type { Bindings } from "../types/bindings";

/**
 * OpenAI 呼び出しの共通部（埋め込み / チャット生成）。
 * VideoQ の OpenAI API キー解決とエラー分類。
 *   - キー未設定           → LlmConfigurationError（HTTP 400 / SSE LLM_CONFIGURATION_ERROR）
 *   - 401（キー不正）      → LlmConfigurationError
 *   - その他の失敗         → LlmProviderError（HTTP 500 でマスク / SSE LLM_PROVIDER_ERROR）
 */
export class LlmConfigurationError extends Error {
  readonly name = "LlmConfigurationError";
}

export class LlmProviderError extends Error {
  readonly name = "LlmProviderError";
}

export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
export const DEFAULT_LLM_MODEL = "gpt-4o-mini";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

/** 用途別の OpenAI API キーを解決する。purpose はエラーメッセージにそのまま入る。 */
export function resolveOpenAiKey(env: Bindings, purpose: string): string {
  const key = env.OPENAI_API_KEY;
  if (!key) {
    throw new LlmConfigurationError(
      `OpenAI API key is required when using ${purpose}. ` +
        "Please set OPENAI_API_KEY in the server environment.",
    );
  }
  return key;
}

export const openAiBaseUrl = (env: Bindings): string =>
  (env.OPENAI_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");

/** OpenAI HTTP エラーを VideoQ の LLM エラー分類へ変換する。 */
export async function throwForResponse(res: Response): Promise<never> {
  const body = await res.text().catch(() => "");
  if (res.status === 401) {
    throw new LlmConfigurationError(
      "Invalid OpenAI API key. Please check your API key in Settings.",
    );
  }
  throw new LlmProviderError(`OpenAI request failed (${res.status}): ${body.slice(0, 500)}`);
}
