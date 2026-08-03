import {
  DEFAULT_LLM_MODEL,
  LlmProviderError,
  openAiBaseUrl,
  resolveOpenAiKey,
  throwForResponse,
} from "./openai";
import type { Bindings } from "../types/bindings";

/**
 * QA RAG の LLM 呼び出し。temperature=0.0、max_tokens=1024 を使う。
 * プロンプトは system + human の 2 通のみで、
 * 会話履歴は渡さない（`ChatPromptTemplate.from_messages([system, human])`）。
 */
const MAX_TOKENS = 1024;
/** GradeReply 用の max_tokens=256 設定。 */
export const GRADING_MAX_TOKENS = 256;

type ChatMessage = { role: "system" | "user"; content: string };

function requestBody(
  env: Bindings,
  messages: ChatMessage[],
  stream: boolean,
  maxTokens: number,
) {
  return JSON.stringify({
    model: env.LLM_MODEL || DEFAULT_LLM_MODEL,
    messages,
    temperature: 0,
    max_tokens: maxTokens,
    ...(stream ? { stream: true } : {}),
  });
}

async function postChatCompletions(
  env: Bindings,
  messages: ChatMessage[],
  stream: boolean,
  signal?: AbortSignal,
  maxTokens: number = MAX_TOKENS,
): Promise<Response> {
  const apiKey = resolveOpenAiKey(env, "OpenAI LLM");
  const res = await fetch(`${openAiBaseUrl(env)}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: requestBody(env, messages, stream, maxTokens),
    signal,
  });
  if (!res.ok) await throwForResponse(res);
  return res;
}

const promptMessages = (systemPrompt: string, queryText: string): ChatMessage[] => [
  { role: "system", content: systemPrompt },
  { role: "user", content: queryText },
];

/** 非ストリーミング（`llm.invoke`）。回答本文だけを返す。 */
export async function generateReply(
  env: Bindings,
  systemPrompt: string,
  queryText: string,
  opts?: { maxTokens?: number },
): Promise<string> {
  const res = await postChatCompletions(
    env,
    promptMessages(systemPrompt, queryText),
    false,
    undefined,
    opts?.maxTokens ?? MAX_TOKENS,
  );
  const json = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  return json.choices?.[0]?.message?.content ?? "";
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
 * ストリーミング（`llm.stream`）。空でないテキスト差分のみを yield する
 * 文字列以外と空文字は破棄する。
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
  const res = await postChatCompletions(
    env,
    promptMessages(systemPrompt, queryText),
    true,
    signal,
  );
  if (!res.body) throw new LlmProviderError("OpenAI stream response had no body.");

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;

      // SSE フレームは空行区切り。行頭 "data: " のみ扱う（OpenAI は event 名を使わない）。
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "" || payload === "[DONE]") continue;
          let parsed: { choices?: { delta?: { content?: string | null } }[] };
          try {
            parsed = JSON.parse(payload);
          } catch {
            continue; // 壊れたストリームフレームは無視する。
          }
          const text = parsed.choices?.[0]?.delta?.content;
          if (typeof text === "string" && text) yield text;
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}
