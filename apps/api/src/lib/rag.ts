import { createAgent, createMiddleware, tool, type ToolRuntime } from "langchain";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AIMessageChunk, BaseMessage } from "@langchain/core/messages";
import { z } from "zod";
import { createChatModel, toLlmError } from "./chat-model";
import { deadlineSignal } from "./request-timeout";
import { courseInfoTool, MAX_COURSE_INFO_CALLS } from "./rag-course-info";
import {
  LLM_REQUEST_TIMEOUT_MS,
  LLM_STREAM_TIMEOUT_MS,
  MAX_TOKENS,
  generateReply,
  streamReply,
} from "./llm";
import { buildAgentSystemPrompt, buildSystemPrompt } from "./prompts";
import { openSceneSearch, type SceneHit, type SceneSearch } from "../repositories/vector-repository";
import type { Bindings } from "../types/bindings";

/**
 * QA モードの RAG 本体（ReAct）。
 * 最新 user 質問を抽出 → 講座メタ情報取得 / シーン検索 → 取得した根拠から回答する。
 * 検索は最大 MAX_SCENE_SEARCHES 回。メタ情報だけの回答では検索接続を開かない。
 * 会話履歴は渡さない（system + human の 2 通のみ）。
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

/** 1 回答あたりのベクトル検索回数の上限（1 回 = embedding 1 + LLM 1 のコスト）。 */
export const MAX_SCENE_SEARCHES = 3;

/** ヒット 0 件でも「検索したが無かった」と伝える。空文字だとモデルが再検索を繰り返す。 */
const NO_HITS = "No scenes matched this query.";

/** 上限超過はツール結果として返す。エラーで打ち切ると回答本文が無いまま終わるため。 */
const SEARCH_LIMIT_REACHED =
  "Search limit reached: no more searches are available for this answer. " +
  "Answer now using the scenes you already have, or state that the question is " +
  "outside the scope of the video materials.";

/**
 * 暴走時の保険。1 検索あたり model → tools の 2 ステップ進むので、
 * 上限まで検索しても足りる余白を持たせた値にする。
 */
export const MAX_TOOL_ROUNDS = MAX_SCENE_SEARCHES + MAX_COURSE_INFO_CALLS;
const RECURSION_LIMIT = 2 * MAX_TOOL_ROUNDS + 4;

/** 最新の user メッセージ本文を抽出する。 */
export function extractLatestUserQuery(messages: readonly ChatMessageInput[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user" && m.content) return m.content;
  }
  if (messages.length > 0) return messages[messages.length - 1].content ?? "";
  return "";
}

export type RagParams = {
  messages: readonly ChatMessageInput[];
  ownerUserId: string;
  videoIds: readonly number[] | null;
  locale: string | null;
  courseContext: string | null;
  /** setupChat でアクセス確認済みの講座ID。クライアントやモデルから直接渡さない。 */
  courseId?: number | null;
};

const sceneKey = (hit: SceneHit) => `${hit.videoId}|${hit.startTime}|${hit.endTime}`;

/**
 * 複数回の検索結果を 1 本の連番に束ねる。
 * 引用 [N] の N は「その回答で何番目に見つかったシーンか」で、
 * withCitationIds が振る citation id（配列順 + 1）と一致する。
 */
class SceneCollector {
  private readonly order: SceneHit[] = [];
  private readonly seen = new Map<string, number>();
  readonly courseContexts = new Set<string>();

  /** 既出なら既存の番号を、新規なら末尾に足して新しい番号を返す（1 始まり）。 */
  add(hit: SceneHit): number {
    const key = sceneKey(hit);
    const known = this.seen.get(key);
    if (known !== undefined) return known;
    this.order.push(hit);
    const index = this.order.length;
    this.seen.set(key, index);
    return index;
  }

  get hits(): readonly SceneHit[] {
    return this.order;
  }
}

const formatHit = (hit: SceneHit, index: number) =>
  `[${index}] ${hit.videoTitle} ${hit.startTime} - ${hit.endTime}\n${hit.content}`;

function sceneSearchTool(
  search: SceneSearch,
  collector: SceneCollector,
  videoIds: readonly number[],
) {
  let used = 0;
  const allowedVideoIds = new Set(videoIds);
  return tool(
    async ({ query, video_ids }, runtime: ToolRuntime) => {
      // 上限はツール側で数える。middleware で打ち切るとモデルが最終回答を
      // 生成する前にグラフが終わってしまう。
      if (used >= MAX_SCENE_SEARCHES) return SEARCH_LIMIT_REACHED;
      const searchId = ++used;
      if (video_ids?.some((id) => !allowedVideoIds.has(id))) {
        return "Invalid video_ids: only videos in the current course may be searched. " +
          "Use get_course_info to find valid IDs; this search was not executed.";
      }
      // custom stream は検索の完了や次のモデルの応答を待たずに UI へ届く。
      runtime.writer?.({ searching: query, searchId } satisfies RagSearchProgress);
      const hits = await search.search(query, undefined, video_ids);
      runtime.writer?.({
        searchCompleted: { id: searchId, query, count: hits.length },
      } satisfies RagSearchProgress);
      if (hits.length === 0) return NO_HITS;
      return hits.map((hit) => formatHit(hit, collector.add(hit))).join("\n\n");
    },
    {
      name: "search_scenes",
      description:
        "Search the scenes of the user's video course by meaning and return the closest ones. " +
        "Required before answering definitions, explanations, comparisons, examples, calculations " +
        "or summaries, including short terms and questions that do not explicitly mention the course. " +
        "For course-wide content, call directly with video_ids omitted. For a specific video or lecture, " +
        "first identify it with get_course_info and include its ID in video_ids on every search. " +
        "Pass a natural-language query describing what you need; it does not have to be the " +
        "user's question verbatim. Optionally select video_ids from get_course_info; omitting " +
        "them searches the whole current course. Scenes come back numbered as [N] for inline citation.",
      schema: z.object({
        query: z
          .string()
          .trim()
          .min(1)
          .max(2000)
          .describe("What to look for, in the same language as the course material."),
        video_ids: z.array(z.number().int().positive().safe()).min(1).max(50).optional()
          .describe("IDs of videos in the current course to search; omit for the whole course."),
      }).strict(),
    },
  );
}

/** 検索スコープを固定した ReAct エージェントを組み立てる。 */
function buildAgent(
  env: Bindings,
  params: {
    search: SceneSearch;
    collector: SceneCollector;
    timeoutMs: number;
    scope: RagParams;
  },
) {
  let modelCalls = 0;
  // system は createAgent の systemPrompt ではなく messages で渡す。
  // systemPrompt はコンテンツブロック配列（[{type:"text"}]）で送信されるため、
  // 素の文字列しか受け付けない OpenAI 互換ゲートウェイでも動くようにする。
  return createAgent({
    model: createChatModel(env, { maxTokens: MAX_TOKENS, timeoutMs: params.timeoutMs }),
    tools: [
      sceneSearchTool(params.search, params.collector, params.scope.videoIds ?? []),
      ...(params.scope.courseId != null ? [courseInfoTool(env, {
        courseId: params.scope.courseId,
        ownerUserId: params.scope.ownerUserId,
      }, (context) => params.collector.courseContexts.add(context))] : []),
    ],
    middleware: [
      createMiddleware({
        name: "propagateSearchErrors",
        // wrapToolCall 経由の実行例外は、そのまま呼び出し元へ伝播する。
        // DB / 埋め込み障害で次の LLM 呼び出しを始めず、利用枠を返却する。
        // ツール引数の検証エラーは LangChain が従来どおりモデルへ返す。
        wrapToolCall: (request, handler) => handler(request),
        // 引数不備の繰り返しも含め、最終ターンはツールなしで回答させる。
        wrapModelCall: (request, handler) => handler({
          ...request,
          tools: ++modelCalls > MAX_TOOL_ROUNDS ? [] : request.tools,
        }),
      }),
    ],
  });
}

const agentInput = (systemPrompt: string, queryText: string) => ({
  messages: [new SystemMessage(systemPrompt), new HumanMessage(queryText)],
});

function toContext(
  queryText: string,
  systemPrompt: string,
  collector: SceneCollector,
): RagContext {
  const hits = collector.hits;
  return {
    queryText,
    systemPrompt,
    citations:
      hits.length === 0
        ? null
        : hits.map((hit) => ({
            video_id: hit.videoId,
            title: hit.videoTitle,
            start_time: hit.startTime,
            end_time: hit.endTime,
          })),
    retrievedContexts: [
      ...hits.map((hit) => hit.content).filter((text) => text !== ""),
      ...collector.courseContexts,
    ],
  };
}

const hasAgentContext = (params: RagParams): boolean =>
  params.courseId != null || (params.videoIds !== null && params.videoIds.length > 0);

/** 同時ツール呼び出しでも接続は1つ。検索を呼ぶまでDB・埋め込みに依存しない。 */
function lazySceneSearch(env: Bindings, params: RagParams): SceneSearch {
  let pending: Promise<SceneSearch> | undefined;
  return {
    async search(query, k, videoIds) {
      if (!params.videoIds?.length) return [];
      pending ??= openSceneSearch(env, {
        userId: params.ownerUserId,
        videoIds: params.videoIds,
      });
      return (await pending).search(query, k, videoIds);
    },
    async close() {
      // 初期化失敗時の close は openSceneSearch が行う。元の例外を上書きしない。
      const search = await pending?.catch(() => undefined);
      await search?.close();
    },
  };
}

const emptyContext = (queryText: string, params: RagParams): RagContext => ({
  queryText,
  systemPrompt: buildSystemPrompt(params.locale, [], params.courseContext),
  citations: null,
  retrievedContexts: [],
});

export async function runRag(
  env: Bindings,
  params: RagParams,
): Promise<RagContext & { content: string }> {
  const queryText = extractLatestUserQuery(params.messages);

  if (!hasAgentContext(params)) {
    const ctx = emptyContext(queryText, params);
    return { ...ctx, content: await generateReply(env, ctx.systemPrompt, queryText) };
  }

  const search = lazySceneSearch(env, params);
  const collector = new SceneCollector();
  const systemPrompt = buildAgentSystemPrompt(
    params.locale,
    params.courseId != null ? null : params.courseContext,
    MAX_SCENE_SEARCHES,
    MAX_COURSE_INFO_CALLS,
  );
  try {
    const agent = buildAgent(env, {
      search,
      collector,
      timeoutMs: LLM_REQUEST_TIMEOUT_MS,
      scope: params,
    });
    const result = await agent.invoke(agentInput(systemPrompt, queryText), {
      recursionLimit: RECURSION_LIMIT,
      signal: deadlineSignal(LLM_REQUEST_TIMEOUT_MS),
    });
    return {
      ...toContext(queryText, systemPrompt, collector),
      content: finalText(result.messages),
    };
  } catch (error) {
    throw toLlmError(error);
  } finally {
    await search.close();
  }
}

/** 実行後のメッセージ列から最後の AI 応答本文を取り出す。 */
function finalText(messages: readonly BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.getType() === "ai" && message.text) return message.text;
  }
  return "";
}

const searchProgressSchema = z.union([
  z.object({ searching: z.string(), searchId: z.number().int().positive() }),
  z.object({ searchCompleted: z.object({
    id: z.number().int().positive(), query: z.string(), count: z.number().int().nonnegative(),
  }) }),
]);
type RagSearchProgress = z.infer<typeof searchProgressSchema>;

export type RagStreamChunk =
  | { text: string }
  | RagSearchProgress
  | { final: RagContext };

/** `signal` はクライアント切断時に上流 LLM も止めるためのもの（コスト保護）。 */
export async function* streamRag(
  env: Bindings,
  params: RagParams,
  signal?: AbortSignal,
): AsyncGenerator<RagStreamChunk> {
  const queryText = extractLatestUserQuery(params.messages);

  if (!hasAgentContext(params)) {
    const ctx = emptyContext(queryText, params);
    for await (const text of streamReply(env, ctx.systemPrompt, queryText, signal)) {
      yield { text };
    }
    yield { final: ctx };
    return;
  }

  const search = lazySceneSearch(env, params);
  const collector = new SceneCollector();
  const requestSignal = deadlineSignal(LLM_STREAM_TIMEOUT_MS, signal);
  const systemPrompt = buildAgentSystemPrompt(
    params.locale,
    params.courseId != null ? null : params.courseContext,
    MAX_SCENE_SEARCHES,
    MAX_COURSE_INFO_CALLS,
  );
  try {
    const agent = buildAgent(env, {
      search,
      collector,
      timeoutMs: LLM_STREAM_TIMEOUT_MS,
      scope: params,
    });

    const stream = await agent.stream(agentInput(systemPrompt, queryText), {
      streamMode: ["messages", "custom"],
      signal: requestSignal,
      recursionLimit: RECURSION_LIMIT,
    });

    // テキストの後からツール呼び出しが来ることもあるため、本文は最終ターンの
    // 完了まで保留する。検索前の前置きを送ると検索障害時に利用枠を返却できない。
    let answerParts: string[] = [];
    let toolCallTurn = false;
    let turnId: string | undefined;
    for await (const [mode, chunk] of stream) {
      if (mode === "custom") {
        const progress = searchProgressSchema.safeParse(chunk);
        if (progress.success) yield progress.data;
        continue;
      }

      const message = messageOf(chunk);
      if (!message) continue;
      if (message.id !== turnId) {
        turnId = message.id;
        toolCallTurn = false;
        answerParts = [];
      }
      if (message.tool_call_chunks?.length || message.tool_calls?.length) {
        toolCallTurn = true;
        answerParts = [];
      }
      if (toolCallTurn) continue;
      if (message.text) answerParts.push(message.text);
    }
    requestSignal.throwIfAborted();

    for (const text of answerParts) yield { text };
    yield { final: toContext(queryText, systemPrompt, collector) };
  } catch (error) {
    throw toLlmError(error);
  } finally {
    await search.close();
  }
}

/**
 * streamMode: "messages" は [チャンク, メタデータ] のタプルを流す。
 * ツールノードが返す ToolMessage（検索結果そのもの）は回答本文ではないので除く。
 */
function messageOf(chunk: unknown): AIMessageChunk | null {
  const message = Array.isArray(chunk) ? chunk[0] : chunk;
  if (typeof message !== "object" || message === null) return null;
  const candidate = message as AIMessageChunk;
  if (typeof candidate.getType !== "function" || candidate.getType() !== "ai") return null;
  return candidate;
}
