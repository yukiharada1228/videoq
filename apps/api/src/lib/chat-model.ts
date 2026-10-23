import { ChatOpenAICompletions } from "@langchain/openai";
import type OpenAI from "openai";
import type { AnswerCostLedger } from "./answer-cost-ledger";
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
 * strict json_schema と tool calling に対応する Chat Completions が必要:
 *   - temperature=0 / model は LLM_MODEL（既定 gpt-6-luna）
 *   - OPENAI_BASE_URL で OpenAI 互換エンドポイントへ差し替え可能
 *   - 失敗は LlmConfigurationError / LlmProviderError のどちらかに正規化する
 */

/**
 * リトライは行わない（直 fetch 実装と同じ挙動）。
 * 429/5xx の自動リトライはレイテンシとクォータ予約の保持時間を伸ばすだけで、
 * ストリーミング中の切断はどのみち復旧できない。
 */
const MAX_RETRIES = 0;

/** Preserve refusal metadata omitted by LangChain's completions converter. */
class AnswerChatModel extends ChatOpenAICompletions {
  costLedger?: AnswerCostLedger;
  separateToolSchema = false;
  override completionWithRetry(request: OpenAI.Chat.ChatCompletionCreateParamsStreaming, options?: OpenAI.RequestOptions): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>>;
  override completionWithRetry(request: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming, options?: OpenAI.RequestOptions): Promise<OpenAI.Chat.Completions.ChatCompletion>;
  override completionWithRetry(request: OpenAI.Chat.ChatCompletionCreateParams, options?: OpenAI.RequestOptions): Promise<OpenAI.Chat.Completions.ChatCompletion | AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>>;
  override async completionWithRetry(request: OpenAI.Chat.ChatCompletionCreateParams, options?: OpenAI.RequestOptions): Promise<OpenAI.Chat.Completions.ChatCompletion | AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
    if (this.separateToolSchema && request.tools?.length && request.response_format?.type === "json_schema") {
      // Some compatible servers apply the final-answer grammar to tool calls
      // too, preventing retrieval. Decide tools without that grammar, then
      // generate the terminal answer with native schema enforcement. A draft
      // answer is discarded, never streamed or used as conversion input.
      const { response_format: _format, stream_options: _streamOptions, ...decisionRequest } = request;
      const decision = await this.completionWithRetry({ ...decisionRequest, stream: false }, options);
      const completed = decision as OpenAI.Chat.Completions.ChatCompletion;
      const choice = completed.choices[0];
      if (!choice || choice.message.refusal || !["stop", "tool_calls"].includes(choice.finish_reason)) {
        throw new LlmProviderError("Local tool decision refused or incomplete.");
      }
      const calls = choice.message.tool_calls;
      if (calls?.length) {
        const normalized = { ...completed, choices: [{ ...choice, message: { ...choice.message, content: null } }] };
        if (!request.stream) return normalized;
        const toolCalls = calls.map((call, index) => {
          if (call.type !== "function") throw new LlmConfigurationError("Local inference requires function tool calls.");
          return { index, id: call.id, type: "function" as const, function: call.function };
        });
        return (async function* (): AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk> {
          const base = { id: completed.id, object: "chat.completion.chunk" as const,
            created: completed.created, model: completed.model };
          yield { ...base, choices: [{ index: 0, delta: { role: "assistant", tool_calls: toolCalls }, finish_reason: null }] };
          yield { ...base, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage: completed.usage };
        })();
      }
      return this.completionWithRetry({ ...request, tools: undefined, tool_choice: undefined, parallel_tool_calls: undefined }, options);
    }
    // The SDK's .parse() tries to parse nonempty tool preambles as final JSON.
    // Keep native schema enforcement on the request, and let providerStrategy
    // validate terminal responses after the agent has processed tool calls.
    const clientOptions = this._getClientOptions(options);
    const call = this.costLedger?.begin("answer_model", request.model);
    const trackedRequest = request.stream
      ? { ...request, stream_options: { ...(request.stream_options ?? {}), include_usage: true } }
      : request;
    try {
      const response = await this.caller.callWithOptions({ maxRetries: MAX_RETRIES }, () =>
        this.client.chat.completions.create(trackedRequest, { ...clientOptions, maxRetries: MAX_RETRIES }));
      if (request.stream) {
        const chunks = response as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
        return (async function* () {
          let usage: unknown;
          try {
            for await (const chunk of chunks) {
              if (chunk.usage) usage = chunk.usage;
              yield chunk;
            }
            call?.complete(usage);
          } catch (error) {
            if (error instanceof Error && error.name === "AbortError") call?.interrupt(usage);
            else call?.fail(usage);
            throw error;
          }
        })();
      }
      call?.complete((response as OpenAI.Chat.Completions.ChatCompletion).usage);
      return response;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") call?.interrupt();
      else call?.fail();
      throw error;
    }
  }
  protected override _convertCompletionsMessageToBaseMessage(message: OpenAI.ChatCompletionMessage, raw: OpenAI.ChatCompletion) {
    const converted = super._convertCompletionsMessageToBaseMessage(message, raw);
    if (message.refusal) converted.additional_kwargs.refusal = message.refusal;
    return converted;
  }
  protected override _convertCompletionsDeltaToBaseMessageChunk(delta: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta, raw: OpenAI.Chat.Completions.ChatCompletionChunk, role?: OpenAI.Chat.ChatCompletionRole) {
    const converted = super._convertCompletionsDeltaToBaseMessageChunk(delta, raw, role);
    if (delta.refusal) converted.additional_kwargs.refusal = delta.refusal;
    // Auto-streaming through agent.invoke keeps message metadata, but does not
    // copy generationInfo (unlike model.stream). Preserve the terminal status
    // here so length/content_filter endings still fail final validation.
    const finishReason = raw.choices[0]?.finish_reason;
    if (finishReason) converted.response_metadata = { ...converted.response_metadata, finish_reason: finishReason };
    return converted;
  }
}

export function createChatModel(
  env: Bindings,
  opts: { maxTokens: number; timeoutMs: number; costLedger?: AnswerCostLedger },
): ChatOpenAICompletions {
  const apiKey = resolveOpenAiKey(env, "OpenAI LLM");
  const model = env.LLM_MODEL || DEFAULT_LLM_MODEL;
  // useResponsesApi: false でも ChatOpenAI はモデル名で /responses を選ぶ。
  // 互換サーバーでも /chat/completions を使うため、専用クラスで固定する。
  const chatModel = new AnswerChatModel({
    model,
    apiKey,
    configuration: { baseURL: openAiBaseUrl(env) },
    temperature: 0,
    reasoning: env.LLM_REASONING_EFFORT ? { effort: env.LLM_REASONING_EFFORT }
      : model === "gpt-6-luna" ? { effort: "none" } : undefined,
    // LangChain filters its reasoning option by known OpenAI model names.
    // Compatible local models need the wire field even with a custom name.
    modelKwargs: env.LLM_REASONING_EFFORT ? { reasoning_effort: env.LLM_REASONING_EFFORT } : undefined,
    maxTokens: opts.maxTokens,
    timeout: opts.timeoutMs,
    maxRetries: MAX_RETRIES,
  });
  chatModel.costLedger = opts.costLedger;
  chatModel.separateToolSchema = env.LLM_SEPARATE_TOOL_SCHEMA === "true";
  return chatModel;
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

  const status = statusOf(error);
  if (status === 401) {
    return new LlmConfigurationError(
      "Invalid OpenAI API key. Please check your API key in Settings.",
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  if ((status === 400 || status === 422) && /response_format|json_schema|structured.output|strict|tool.*(?:unsupported|not.support)/i.test(message)) {
    return new LlmConfigurationError("The configured LLM endpoint/model must support strict json_schema output and tool calling.");
  }
  return new LlmProviderError(
    status === null
      ? `OpenAI request failed: ${message.slice(0, 500)}`
      : `OpenAI request failed (${status}): ${message.slice(0, 500)}`,
  );
}
