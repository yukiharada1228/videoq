import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createChatModel, toLlmError } from "./chat-model";
import { deadlineSignal } from "./request-timeout";
import type { Bindings } from "../types/bindings";

/**
 * QA RAG / PLOG の LLM 呼び出し。temperature=0.0、max_tokens=1024 を使う。
 * プロンプトは system + human の 2 通のみで、
 * 会話履歴は渡さない（`ChatPromptTemplate.from_messages([system, human])`）。
 */
export const MAX_TOKENS = 1024;
export const LLM_REQUEST_TIMEOUT_MS = 2 * 60_000;
export const LLM_STREAM_TIMEOUT_MS = 5 * 60_000;
/** GradeReply 用の max_tokens=256 設定。 */
export const GRADING_MAX_TOKENS = 256;

const promptMessages = (systemPrompt: string, queryText: string) => [
  new SystemMessage(systemPrompt),
  new HumanMessage(queryText),
];

/** 非ストリーミング（`llm.invoke`）。回答本文だけを返す。 */
export async function generateReply(
  env: Bindings,
  systemPrompt: string,
  queryText: string,
  opts?: { maxTokens?: number },
): Promise<string> {
  const model = createChatModel(env, {
    maxTokens: opts?.maxTokens ?? MAX_TOKENS,
    timeoutMs: LLM_REQUEST_TIMEOUT_MS,
  });
  try {
    const message = await model.invoke(promptMessages(systemPrompt, queryText));
    return message.text;
  } catch (error) {
    throw toLlmError(error);
  }
}

/** GradeReply 用（max_tokens=256）。 */
export async function generateGradingReply(
  env: Bindings,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  return generateReply(env, systemPrompt, userPrompt, { maxTokens: GRADING_MAX_TOKENS });
}

/**
 * ストリーミング（`llm.stream`）。空でないテキスト差分のみを yield する。
 *
 * `signal` にはクライアント接続の中断シグナルを渡す。切断後も OpenAI からの
 * 受信を続けるとサーバー側キーの課金だけが進むため、上流ごと止める。
 */
export async function* streamReply(
  env: Bindings,
  systemPrompt: string,
  queryText: string,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const model = createChatModel(env, {
    maxTokens: MAX_TOKENS,
    timeoutMs: LLM_STREAM_TIMEOUT_MS,
  });
  // SDK の timeout は SSE 本文の受信を保護しないため、受信完了まで期限を保つ。
  const requestSignal = deadlineSignal(LLM_STREAM_TIMEOUT_MS, signal);
  try {
    const stream = await model.stream(promptMessages(systemPrompt, queryText), {
      signal: requestSignal,
    });
    for await (const chunk of stream) {
      requestSignal.throwIfAborted();
      if (chunk.text) yield chunk.text;
    }
    // SDK が中断を正常なストリーム終端として返す場合も成功にはしない。
    requestSignal.throwIfAborted();
  } catch (error) {
    throw toLlmError(error);
  }
}
