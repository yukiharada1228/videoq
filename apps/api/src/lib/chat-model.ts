import { ChatOpenAICompletions } from "@langchain/openai";
import {
  DEFAULT_LLM_MODEL,
  LlmConfigurationError,
  LlmProviderError,
  openAiBaseUrl,
  resolveOpenAiKey,
} from "./openai";
import type { Bindings } from "../types/bindings";

/**
 * LLM 呼び出しの土台（ChatOpenAI）。
 * 直 fetch 実装から移行したが、外向きの契約は変えていない:
 *   - temperature=0 / model は LLM_MODEL（既定 gpt-4o-mini）
 *   - OPENAI_BASE_URL で OpenAI 互換エンドポイントへ差し替え可能
 *   - 失敗は LlmConfigurationError / LlmProviderError のどちらかに正規化する
 */

/**
 * リトライは行わない（直 fetch 実装と同じ挙動）。
 * 429/5xx の自動リトライはレイテンシとクォータ予約の保持時間を伸ばすだけで、
 * ストリーミング中の切断はどのみち復旧できない。
 */
const MAX_RETRIES = 0;

export function createChatModel(
  env: Bindings,
  opts: { maxTokens: number; timeoutMs: number },
): ChatOpenAICompletions {
  const apiKey = resolveOpenAiKey(env, "OpenAI LLM");
  // useResponsesApi: false でも ChatOpenAI はモデル名で /responses を選ぶ。
  // 互換サーバーでも /chat/completions を使うため、専用クラスで固定する。
  return new ChatOpenAICompletions({
    model: env.LLM_MODEL || DEFAULT_LLM_MODEL,
    apiKey,
    configuration: { baseURL: openAiBaseUrl(env) },
    temperature: 0,
    maxTokens: opts.maxTokens,
    timeout: opts.timeoutMs,
    maxRetries: MAX_RETRIES,
  });
}

/** OpenAI SDK / LangChain が投げた例外から HTTP ステータスを拾う。 */
function statusOf(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const e = error as { status?: unknown; response?: { status?: unknown } };
  if (typeof e.status === "number") return e.status;
  if (typeof e.response?.status === "number") return e.response.status;
  return null;
}

/**
 * LLM 例外を VideoQ のエラー分類へ正規化する。
 *   - 401（キー不正）→ LlmConfigurationError（HTTP 400 / SSE LLM_CONFIGURATION_ERROR）
 *   - それ以外       → LlmProviderError（HTTP 500 でマスク / SSE LLM_PROVIDER_ERROR）
 * AbortError は呼び出し側（クライアント切断）に委ねるのでそのまま投げ直す。
 */
export function toLlmError(error: unknown): unknown {
  if (error instanceof LlmConfigurationError || error instanceof LlmProviderError) {
    return error;
  }
  if (error instanceof Error && error.name === "AbortError") return error;

  if (statusOf(error) === 401) {
    return new LlmConfigurationError(
      "Invalid OpenAI API key. Please check your API key in Settings.",
    );
  }
  const status = statusOf(error);
  const message = error instanceof Error ? error.message : String(error);
  return new LlmProviderError(
    status === null
      ? `OpenAI request failed: ${message.slice(0, 500)}`
      : `OpenAI request failed (${status}): ${message.slice(0, 500)}`,
  );
}
