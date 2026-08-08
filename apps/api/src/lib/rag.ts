import { embedQuery } from "./embeddings";
import { generateReply, streamReply } from "./llm";
import { buildSystemPrompt } from "./prompts";
import { searchScenes } from "../repositories/vector-repository";
import type { Bindings } from "../types/bindings";

/**
 * QA モードの RAG 本体。
 * 最新 user 質問を抽出 → ベクトル検索 → system プロンプト生成 →
 * LLM（system + human の 2 通のみ。会話履歴は渡さない）。
 */
export type ChatMessageInput = { role: string; content: string };

/** ChatLog / レスポンスに載る引用（id 付与は presentation 層で行う）。 */
export type RagCitation = {
  video_id: number;
  title: string;
  start_time: string | null;
  end_time: string | null;
};

export type RagContext = {
  queryText: string;
  systemPrompt: string;
  citations: RagCitation[] | null;
  retrievedContexts: string[];
};

/** 最新の user メッセージ本文を抽出する。 */
export function extractLatestUserQuery(messages: readonly ChatMessageInput[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user" && m.content) return m.content;
  }
  if (messages.length > 0) return messages[messages.length - 1].content ?? "";
  return "";
}

/**
 * 検索とプロンプト生成まで（LLM 呼び出し前）。
 * group が無い、またはメンバー動画が無い場合は検索も埋め込みも実行しない。
 */
export async function prepareRagContext(
  env: Bindings,
  params: {
    messages: readonly ChatMessageInput[];
    ownerUserId: string;
    videoIds: readonly number[] | null;
    locale: string | null;
    groupContext: string | null;
  },
): Promise<RagContext> {
  const queryText = extractLatestUserQuery(params.messages);

  const hasRetriever = params.videoIds !== null && params.videoIds.length > 0;
  const docs = hasRetriever
    ? await searchScenes(env, {
        userId: params.ownerUserId,
        videoIds: params.videoIds!,
        embedding: await embedQuery(env, queryText),
      })
    : [];

  const references = docs.map(
    (d, i) => `[${i + 1}] ${d.videoTitle} ${d.startTime} - ${d.endTime}\n${d.content}`,
  );

  return {
    queryText,
    systemPrompt: buildSystemPrompt(params.locale, references, params.groupContext),
    citations:
      docs.length === 0
        ? null
        : docs.map((d) => ({
            video_id: d.videoId,
            title: d.videoTitle,
            start_time: d.startTime,
            end_time: d.endTime,
          })),
    retrievedContexts: docs.map((d) => d.content).filter((t) => t !== ""),
  };
}

export async function runRag(
  env: Bindings,
  params: Parameters<typeof prepareRagContext>[1],
): Promise<RagContext & { content: string }> {
  const ctx = await prepareRagContext(env, params);
  const content = await generateReply(env, ctx.systemPrompt, ctx.queryText);
  return { ...ctx, content };
}

/** `signal` はクライアント切断時に上流 LLM も止めるためのもの（コスト保護）。 */
export async function* streamRag(
  env: Bindings,
  params: Parameters<typeof prepareRagContext>[1],
  signal?: AbortSignal,
): AsyncGenerator<{ text: string } | { final: RagContext }> {
  const ctx = await prepareRagContext(env, params);
  for await (const text of streamReply(env, ctx.systemPrompt, ctx.queryText, signal)) {
    yield { text };
  }
  yield { final: ctx };
}
