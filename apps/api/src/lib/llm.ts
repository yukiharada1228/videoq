import { HumanMessage, SystemMessage, type AIMessageChunk } from "@langchain/core/messages";
import { createChatModel, toLlmError } from "./chat-model";
import { answerResponseFormat, AnswerTextStream, assertCompletedAnswer, parseModelAnswer } from "./structured-answer";
import type { ModelAnswer } from "@videoq/trpc/chat";
import { deadlineSignal } from "./request-timeout";
import type { Bindings } from "../types/bindings";

/**
 * QA RAG の LLM 呼び出し。temperature=0.0、max_tokens=1024 を使う。
 * プロンプトは system + human の 2 通のみで、
 * 会話履歴は渡さない（`ChatPromptTemplate.from_messages([system, human])`）。
 */
export const MAX_TOKENS = 1024;
export const LLM_REQUEST_TIMEOUT_MS = 2 * 60_000;
export const LLM_STREAM_TIMEOUT_MS = 5 * 60_000;

const promptMessages = (systemPrompt: string, queryText: string) => [
  new SystemMessage(systemPrompt),
  new HumanMessage(queryText),
];

/** 非ストリーミング（`llm.invoke`）。検証済みの構造化回答を返す。 */
export async function generateReply(
  env: Bindings,
  systemPrompt: string,
  queryText: string,
): Promise<ModelAnswer> {
  const model = createChatModel(env, {
    maxTokens: MAX_TOKENS,
    timeoutMs: LLM_REQUEST_TIMEOUT_MS,
  });
  try {
    const message = await model.invoke(promptMessages(systemPrompt, queryText), { response_format: answerResponseFormat });
    assertCompletedAnswer(message);
    return parseModelAnswer(message.text);
  } catch (error) {
    throw toLlmError(error);
  }
}

/**
 * ストリーミング（`llm.stream`）。segmentごとの本文差分と、最後に検証済み回答を返す。
 *
 * `signal` にはクライアント接続の中断シグナルを渡す。切断後も OpenAI からの
 * 受信を続けるとサーバー側キーの課金だけが進むため、上流ごと止める。
 */
export async function* streamReply(
  env: Bindings,
  systemPrompt: string,
  queryText: string,
  signal?: AbortSignal,
): AsyncGenerator<{ segmentIndex: number; text: string } | { answer: ModelAnswer }> {
  const model = createChatModel(env, {
    maxTokens: MAX_TOKENS,
    timeoutMs: LLM_STREAM_TIMEOUT_MS,
  });
  // SDK の timeout は SSE 本文の受信を保護しないため、受信完了まで期限を保つ。
  const requestSignal = deadlineSignal(LLM_STREAM_TIMEOUT_MS, signal);
  try {
    const stream = await model.stream(promptMessages(systemPrompt, queryText), {
      signal: requestSignal,
      response_format: answerResponseFormat,
    });
    const parser = new AnswerTextStream();
    let aggregate: AIMessageChunk | undefined;
    for await (const chunk of stream) {
      requestSignal.throwIfAborted();
      aggregate = aggregate ? aggregate.concat(chunk) : chunk;
      for (const delta of parser.push(chunk.text)) yield delta;
    }
    // SDK が中断を正常なストリーム終端として返す場合も成功にはしない。
    requestSignal.throwIfAborted();
    assertCompletedAnswer(aggregate);
    yield { answer: parser.finish() };
  } catch (error) {
    throw toLlmError(error);
  }
}
