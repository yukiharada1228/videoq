import { Hono } from "hono";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import {
  requireAuth,
  requireScope,
  apiKeyMethod,
  bearerApiKeyMethod,
  jwtMethod,
} from "../middleware/auth";
import { csrfProtect } from "../middleware/csrf";
import {
  getGroupChatHistory,
  getGroupChatHistoryForExport,
  deleteGroupChatLogs,
  getGroupChatAnalytics,
  getFeedbackLog,
  updateChatLogFeedback,
  shareSlugExists,
  getGroupWithMembers,
  createChatLog,
  type GroupChatContext,
} from "../repositories/chat-repository";
import { checkAiAnswersLimit, recordAiAnswerUsage } from "../repositories/quota-repository";
import { runRag, streamRag, type RagCitation } from "../lib/rag";
import { runStudy, streamStudy, PlogNotReadyError } from "../lib/plog-study";
import { enqueueEvaluateChatLog } from "../lib/jobs";
import { LlmConfigurationError } from "../lib/openai";
import {
  validateChatRequest,
  validateOpenAiChatRequest,
  serializerErrors,
  flattenErrors,
  type ValidatedChatRequest,
} from "../utils/chat-request";
import { parseLimitOffset, limitOffsetPage } from "../utils/pagination";
import { buildChatHistoryCsv } from "../utils/csv";
import {
  clientIp,
  enforceThrottles,
  throttledResponse,
} from "../lib/rate-limit";
import type { AppEnv, Bindings } from "../types/bindings";

/**
 * 移行済みのチャット系ルート。
 *   GET    /api/chat/groups/<group_id>/history/   ── チャット履歴（所有者のみ、?download=csv 対応）
 *   DELETE /api/chat/groups/<group_id>/history/   ── 履歴リセット（所有者のみ、204）
 *   GET    /api/chat/groups/<group_id>/analytics/ ── 集計
 *   PATCH  /api/chat/logs/<log_id>/feedback/      ── good/bad フィードバック（共有可）
 *   POST   /api/chat/messages/                    ── RAG / PLOG study チャット（非ストリーミング）
 *   POST   /api/chat/messages/stream/             ── 同上の SSE ストリーミング
 *   POST   /api/v1/chat/completions               ── OpenAI 互換（非ストリーミングのみ, mode=qa）
 */
export const chatRoutes = new Hono<AppEnv>();

const chatAuth = requireAuth(apiKeyMethod, jwtMethod);

/**
 * `?download=csv`。Django は DRF ではなくモデルの値をそのまま CSV に書くため、
 * created_at は UTC の `datetime.isoformat()`、citations は `json.dumps(ensure_ascii=False)`。
 */
const exportHistoryCsv = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const groupId = Number(c.req.param("groupId"));

  const res = await getGroupChatHistoryForExport(c.env, groupId, userId);
  if ("notFound" in res) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Group not found." } },
      404,
    );
  }

  return c.body(buildChatHistoryCsv(res.rows), 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="chat_history_group_${groupId}.csv"`,
  });
};

const history = async (c: Context<AppEnv>) => {
  if (c.req.query("download") === "csv") return exportHistoryCsv(c);

  const userId = c.get("userId")!;
  const groupId = Number(c.req.param("groupId"));
  const { limit, offset } = parseLimitOffset(c);

  const res = await getGroupChatHistory(c.env, groupId, userId, limit, offset);
  if ("notFound" in res) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Group not found." } },
      404,
    );
  }
  return c.json(limitOffsetPage(c, res.count, limit, offset, res.results));
};

chatRoutes.get("/api/chat/groups/:groupId{[0-9]+}/history", chatAuth, history);
chatRoutes.get("/api/chat/groups/:groupId{[0-9]+}/history/", chatAuth, history);

// 履歴リセット（所有者のみ）。required_scope 未指定 = 非安全メソッドは write スコープ。
const resetHistory = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const groupId = Number(c.req.param("groupId"));
  const res = await deleteGroupChatLogs(c.env, groupId, userId);
  if ("notFound" in res) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Group not found." } },
      404,
    );
  }
  return c.body(null, 204);
};

const resetGuards = [chatAuth, csrfProtect, requireScope()] as const;
chatRoutes.delete("/api/chat/groups/:groupId{[0-9]+}/history", ...resetGuards, resetHistory);
chatRoutes.delete("/api/chat/groups/:groupId{[0-9]+}/history/", ...resetGuards, resetHistory);

const analytics = async (c: Context<AppEnv>) => {
  const userId = c.get("userId")!;
  const groupId = Number(c.req.param("groupId"));
  const res = await getGroupChatAnalytics(c.env, groupId, userId);
  if ("notFound" in res) {
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: "Group not found." } },
      404,
    );
  }
  return c.json(res);
};

chatRoutes.get("/api/chat/groups/:groupId{[0-9]+}/analytics", chatAuth, analytics);
chatRoutes.get("/api/chat/groups/:groupId{[0-9]+}/analytics/", chatAuth, analytics);

// --- 書き込み: フィードバック（ChatLogFeedbackView, PATCH）---
// IsAuthenticatedOrSharedAccess 相当: 認証 OR share_slug が解決すれば許可。
const feedbackAuth = createMiddleware<AppEnv>(async (c, next) => {
  for (const m of [apiKeyMethod, jwtMethod]) {
    const r = await m(c);
    if (r.kind === "ok") {
      c.set("userId", r.userId);
      c.set("authVia", r.via);
      if (r.accessLevel) c.set("apiKeyAccessLevel", r.accessLevel);
      return next();
    }
    if (r.kind === "invalid") return c.json({ detail: r.message }, 401);
  }
  const shareSlug = c.req.query("share_slug") || c.req.query("share_token");
  if (shareSlug && (await shareSlugExists(c.env, shareSlug))) {
    c.set("authVia", "share");
    return next();
  }
  return c.json(
    { detail: "Authentication credentials were not provided." },
    401,
  );
});

const err = (c: Context<AppEnv>, status: 400 | 403 | 404, message: string) =>
  c.json({ error: { code: "VALIDATION_ERROR", message } }, status);

const submitFeedback = async (c: Context<AppEnv>) => {
  const logId = Number(c.req.param("logId"));
  const body = await c.req.json<{ feedback?: unknown }>().catch(() => ({}));
  // Django: request.data.get("feedback"); "" と欠落は None
  let feedback = (body as { feedback?: unknown }).feedback ?? null;
  if (feedback === "") feedback = null;

  // validate_feedback_value（get_log より前）
  if (feedback !== null && feedback !== "good" && feedback !== "bad") {
    return err(c, 400, "feedback must be 'good', 'bad', or null (unspecified)");
  }

  const log = await getFeedbackLog(c.env, logId);
  if (!log) return err(c, 404, "Specified chat history not found");

  // assert_feedback_access: query の share_slug が有れば share 判定・無ければ owner 判定
  const shareSlug = c.req.query("share_slug") || c.req.query("share_token");
  if (shareSlug) {
    if (log.group_share_token !== shareSlug) {
      return err(c, 403, "Share token mismatch");
    }
  } else if (log.group_user_id !== c.get("userId")) {
    return err(c, 403, "No permission to access this history");
  }

  const updated = await updateChatLogFeedback(c.env, logId, feedback as string | null);
  return c.json({ chat_log_id: updated.id, feedback: updated.feedback });
};

// PATCH。CSRF(Cookie 認証時) + scope(chat_write) を適用。
const feedbackGuards = [feedbackAuth, csrfProtect, requireScope("chat_write")] as const;
chatRoutes.patch("/api/chat/logs/:logId{[0-9]+}/feedback", ...feedbackGuards, submitFeedback);
chatRoutes.patch("/api/chat/logs/:logId{[0-9]+}/feedback/", ...feedbackGuards, submitFeedback);

// --- 書き込み: チャット送信（ChatView / StreamChatView）---
//
// Django の SendMessageUseCase と同じ順序で処理する:
//   前提条件 → group 解決 → owner 解決 → AI 回答上限 →
//   mode=qa: RAG / mode=study: PlogGuidedChatGateway → ChatLog → 使用量記録。
// throttle: AuthenticatedChatThrottle(300/h) + ShareTokenIPThrottle(100/h)。

/** AuthenticatedChatThrottle + ShareTokenIPThrottle（認証後・view 前）。 */
const chatThrottle = createMiddleware<AppEnv>(async (c, next) => {
  const shareSlug = c.req.query("share_slug") || c.req.query("share_token");
  const denied = await enforceThrottles(c.env, [
    {
      scope: "chat_authenticated",
      ident: c.get("userId") != null ? String(c.get("userId")) : null,
    },
    {
      scope: "chat_share_token_ip",
      ident: shareSlug ? clientIp(c) : null,
    },
  ]);
  if (denied) return throttledResponse(c, denied);
  await next();
});

/** ドメイン例外に対応するエラー記述。ストリーム/非ストリームで表現を変える。 */
type ChatFailure = {
  /** SSE `error` イベントの code。 */
  streamCode: string;
  /** 非ストリーミングの HTTP ステータス。 */
  status: 400 | 403 | 404 | 409 | 500;
  /** 非ストリーミングの error.code（create_error_response の既定は VALIDATION_ERROR）。 */
  code: string;
  message: string;
};

const failures = {
  invalidRequest: (message: string): ChatFailure => ({
    streamCode: "INVALID_REQUEST",
    status: 400,
    code: "VALIDATION_ERROR",
    message,
  }),
  notFound: (entity: string): ChatFailure => ({
    streamCode: "NOT_FOUND",
    status: 404,
    code: "VALIDATION_ERROR",
    message: `${entity} not found.`,
  }),
  permissionDenied: (message: string): ChatFailure => ({
    streamCode: "PERMISSION_DENIED",
    status: 403,
    code: "VALIDATION_ERROR",
    message,
  }),
  overQuota: (): ChatFailure => ({
    streamCode: "OVER_QUOTA",
    status: 403,
    code: "OVER_QUOTA",
    message: "AI chat is unavailable: account storage is over the configured limit.",
  }),
  answersLimit: (limit: number): ChatFailure => ({
    streamCode: "AI_ANSWERS_LIMIT_EXCEEDED",
    status: 400,
    code: "AI_ANSWERS_LIMIT_EXCEEDED",
    message: `AI answers limit exceeded. Limit: ${limit}.`,
  }),
  llmConfiguration: (message: string): ChatFailure => ({
    streamCode: "LLM_CONFIGURATION_ERROR",
    status: 400,
    code: "VALIDATION_ERROR",
    message,
  }),
  llmProvider: (): ChatFailure => ({
    streamCode: "LLM_PROVIDER_ERROR",
    status: 500,
    code: "INTERNAL_ERROR",
    message: "An internal server error occurred.",
  }),
  plogNotReady: (message: string): ChatFailure => ({
    streamCode: "PLOG_NOT_READY",
    status: 409,
    code: "PLOG_NOT_READY",
    message,
  }),
};

/** Accept-Language の先頭値（_get_locale 相当）。 */
function requestLocale(c: Context<AppEnv>): string | null {
  const header = c.req.header("Accept-Language") ?? "";
  if (!header) return null;
  return header.split(",")[0].split(";")[0].trim() || null;
}

const shareSlugOf = (c: Context<AppEnv>) =>
  c.req.query("share_slug") ?? c.req.query("share_token") ?? null;

type ChatSetup = {
  ownerUserId: number;
  group: GroupChatContext | null;
  isShared: boolean;
  locale: string | null;
};

/** LLM 呼び出し前の共通セットアップ（group/owner/quota）。失敗はドメイン例外に対応する。 */
async function setupChat(
  c: Context<AppEnv>,
  req: ValidatedChatRequest,
  shareSlug: string | null,
): Promise<{ ok: true; setup: ChatSetup } | { ok: false; failure: ChatFailure }> {
  const isShared = shareSlug !== null;
  const userId = c.get("userId") ?? null;

  if (req.messages.length === 0)
    return { ok: false, failure: failures.invalidRequest("Messages are empty.") };
  if (isShared && req.groupId === null)
    return { ok: false, failure: failures.invalidRequest("Group ID not specified.") };

  let group: GroupChatContext | null = null;
  if (req.groupId !== null) {
    group = await getGroupWithMembers(c.env, {
      groupId: req.groupId,
      userId: isShared && shareSlug ? null : userId,
      shareToken: isShared && shareSlug ? shareSlug : null,
    });
    if (!group) return { ok: false, failure: failures.notFound("Group") };
  }

  // resolve_owner_user_id: 共有アクセスならグループ所有者、そうでなければ認証ユーザー。
  const ownerUserId = isShared && group ? group.userId : userId;
  if (ownerUserId === null) {
    return {
      ok: false,
      failure: failures.permissionDenied("Authentication is required to send messages."),
    };
  }

  const quota = await checkAiAnswersLimit(c.env, ownerUserId);
  if ("overQuota" in quota) return { ok: false, failure: failures.overQuota() };
  if ("exceeded" in quota)
    return { ok: false, failure: failures.answersLimit(quota.limit) };

  return { ok: true, setup: { ownerUserId, group, isShared, locale: requestLocale(c) } };
}

/** RAG/LLM/study 実行中の例外を Django と同じ分類に落とす。 */
const toFailure = (e: unknown): ChatFailure => {
  if (e instanceof PlogNotReadyError) return failures.plogNotReady(e.message);
  if (e instanceof LlmConfigurationError) return failures.llmConfiguration(e.message);
  return failures.llmProvider();
};

/** citations に 1 始まりの id を付ける（CitationResponseDTO 相当）。 */
const withCitationIds = (citations: readonly RagCitation[]) =>
  citations.map((v, i) => ({ id: i + 1, ...v }));

/** ChatLog 保存 + 使用量記録（Django と同じく group がある時だけ保存）。 */
async function persistTurn(
  env: Bindings,
  setup: ChatSetup,
  turn: {
    question: string;
    answer: string;
    citations: RagCitation[] | null;
    retrievedContexts: string[];
  },
): Promise<{ chatLogId: number | null; feedback: string | null }> {
  if (!setup.group) return { chatLogId: null, feedback: null };
  const log = await createChatLog(env, {
    userId: setup.ownerUserId,
    groupId: setup.group.id,
    question: turn.question,
    answer: turn.answer,
    citations: turn.citations,
    isShared: setup.isShared,
    retrievedContexts: turn.retrievedContexts,
  });
  // Django は on_commit で RAGAS 評価タスクを投げる。失敗は warning 相当の握りつぶし。
  await enqueueEvaluateChatLog(env, log.id).catch(() => null);
  return { chatLogId: log.id, feedback: log.feedback };
}

/** 記録は best-effort（Django も例外を warning で握りつぶす）。 */
const recordUsage = (env: Bindings, userId: number) =>
  recordAiAnswerUsage(env, userId).catch(() => {});

const sendMessage = async (c: Context<AppEnv>) => {
  const parsed = await c.req.json().catch(() => ({}));
  const validation = validateChatRequest(parsed);
  if (!validation.ok) {
    const { message, fields } = flattenErrors(validation.errors);
    return c.json(
      { error: { code: "VALIDATION_ERROR", message, ...(fields ? { fields } : {}) } },
      400,
    );
  }

  const shareSlug = shareSlugOf(c);
  const prepared = await setupChat(c, validation.value, shareSlug);
  if (!prepared.ok) {
    const f = prepared.failure;
    return c.json({ error: { code: f.code, message: f.message } }, f.status);
  }
  const setup = prepared.setup;
  const videoIds = setup.group ? setup.group.memberVideoIds : null;

  let result: {
    content: string;
    queryText: string;
    citations: RagCitation[] | null;
    retrievedContexts: string[];
  };
  try {
    if (validation.value.mode === "study") {
      result = await runStudy(c.env, {
        messages: validation.value.messages,
        videoIds,
        locale: setup.locale,
        studySessionId: validation.value.studySessionId,
      });
    } else {
      result = await runRag(c.env, {
        messages: validation.value.messages,
        ownerUserId: setup.ownerUserId,
        videoIds,
        locale: setup.locale,
        groupContext: setup.group?.description ?? null,
      });
    }
  } catch (e) {
    const f = toFailure(e);
    return c.json({ error: { code: f.code, message: f.message } }, f.status);
  }

  const { chatLogId, feedback } = await persistTurn(c.env, setup, {
    question: result.queryText,
    answer: result.content,
    citations: result.citations,
    retrievedContexts: result.retrievedContexts,
  });

  const body: Record<string, unknown> = { role: "assistant", content: result.content };
  if (validation.value.groupId !== null && result.citations?.length) {
    body.citations = withCitationIds(result.citations);
  }
  if (chatLogId !== null) {
    body.chat_log_id = chatLogId;
    body.feedback = feedback;
  }

  await recordUsage(c.env, setup.ownerUserId);
  return c.json(body);
};

const sseFrame = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;

const streamMessage = async (c: Context<AppEnv>) => {
  const parsed = await c.req.json().catch(() => ({}));
  const validation = validateChatRequest(parsed);
  if (!validation.ok) {
    // StreamChatView は serializer.errors の辞書をそのまま message に入れる。
    return c.json(
      { error: { code: "VALIDATION_ERROR", message: serializerErrors(validation.errors) } },
      400,
    );
  }
  if (validation.value.messages.length === 0) {
    return c.json(
      { error: { code: "INVALID_REQUEST", message: "Messages are empty." } },
      400,
    );
  }

  const shareSlug = shareSlugOf(c);
  const prepared = await setupChat(c, validation.value, shareSlug);

  const encoder = new TextEncoder();
  const groupId = validation.value.groupId;
  const messages = validation.value.messages;
  const mode = validation.value.mode;
  const studySessionId = validation.value.studySessionId;
  // クライアントが切断したら OpenAI への接続も畳む（切断後の課金を止める）。
  const clientSignal: AbortSignal | undefined = c.req.raw.signal;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (data: unknown) => controller.enqueue(encoder.encode(sseFrame(data)));
      try {
        // セットアップ失敗も HTTP 200 のまま SSE の error イベントで返す（Django と同じ）。
        if (!prepared.ok) {
          const f = prepared.failure;
          send({ type: "error", code: f.streamCode, message: f.message });
          return;
        }
        const setup = prepared.setup;
        const videoIds = setup.group ? setup.group.memberVideoIds : null;

        let content = "";
        let final: {
          citations: RagCitation[] | null;
          retrievedContexts: string[];
          queryText: string;
        } = { citations: null, retrievedContexts: [], queryText: "" };

        try {
          if (mode === "study") {
            for await (const chunk of streamStudy(c.env, {
              messages,
              videoIds,
              locale: setup.locale,
              studySessionId,
            })) {
              if ("text" in chunk) {
                content += chunk.text;
                send({ type: "content_chunk", text: chunk.text });
              } else {
                final = {
                  citations: chunk.final.citations,
                  retrievedContexts: chunk.final.retrievedContexts,
                  queryText: chunk.final.queryText,
                };
              }
            }
          } else {
            for await (const chunk of streamRag(
              c.env,
              {
                messages,
                ownerUserId: setup.ownerUserId,
                videoIds,
                locale: setup.locale,
                groupContext: setup.group?.description ?? null,
              },
              clientSignal,
            )) {
              if ("text" in chunk) {
                content += chunk.text;
                send({ type: "content_chunk", text: chunk.text });
              } else {
                final = chunk.final;
              }
            }
          }
        } catch (e) {
          const f = toFailure(e);
          send({ type: "error", code: f.streamCode, message: f.message });
          return;
        }

        const { chatLogId, feedback } = await persistTurn(c.env, setup, {
          question: final.queryText,
          answer: content,
          citations: final.citations,
          retrievedContexts: final.retrievedContexts,
        });

        const done: Record<string, unknown> = {
          type: "done",
          chat_log_id: chatLogId,
          feedback,
        };
        if (groupId !== null && final.citations?.length) {
          done.citations = withCitationIds(final.citations);
        }
        send(done);

        await recordUsage(c.env, setup.ownerUserId);
      } catch {
        // クライアント切断などで enqueue が失敗した場合。ここで握りつぶさないと
        // ストリームが error 状態になり、以降の close も投げる。
      } finally {
        try {
          controller.close();
        } catch {
          /* 既に閉じている */
        }
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
};

const sendGuards = [
  feedbackAuth,
  chatThrottle,
  csrfProtect,
  requireScope("chat_write"),
] as const;
chatRoutes.post("/api/chat/messages", ...sendGuards, sendMessage);
chatRoutes.post("/api/chat/messages/", ...sendGuards, sendMessage);
chatRoutes.post("/api/chat/messages/stream", ...sendGuards, streamMessage);
chatRoutes.post("/api/chat/messages/stream/", ...sendGuards, streamMessage);

// --- OpenAI 互換: POST /api/v1/chat/completions ---
//
// 共有アクセスは無く、認証必須（Bearer は「vq_ で始まれば API キー・それ以外は JWT」）。
// 使用例外は OpenAI 形式 {"error":{message,type}}、検証エラーは DRF の統一封筒のまま。

/** ドメイン例外 → OpenAI error.type。 */
const openAiErrorType = (f: ChatFailure): string => {
  switch (f.streamCode) {
    case "PERMISSION_DENIED":
      return "permission_denied";
    case "OVER_QUOTA":
    case "AI_ANSWERS_LIMIT_EXCEEDED":
      return "insufficient_quota";
    case "LLM_PROVIDER_ERROR":
      return "api_error";
    default:
      return "invalid_request_error";
  }
};

const chatCompletions = async (c: Context<AppEnv>) => {
  const parsed = await c.req.json().catch(() => null);
  const validation = validateOpenAiChatRequest(parsed);
  if (!validation.ok) {
    // is_valid(raise_exception=True) → custom_exception_handler の統一封筒。
    const { message, fields } = flattenErrors(validation.errors);
    return c.json(
      { error: { code: "VALIDATION_ERROR", message, ...(fields ? { fields } : {}) } },
      400,
    );
  }
  const { model, messages, groupId, language } = validation.value;

  // 共有アクセスは無いので share_slug は渡さない（is_shared=False 固定）。
  const prepared = await setupChat(
    c,
    { messages, groupId, mode: "qa", studySessionId: null },
    null,
  );
  if (!prepared.ok) {
    const f = prepared.failure;
    return c.json({ error: { message: f.message, type: openAiErrorType(f) } }, f.status);
  }
  const setup = { ...prepared.setup, locale: language ?? requestLocale(c) };

  let result: Awaited<ReturnType<typeof runRag>>;
  try {
    result = await runRag(c.env, {
      messages,
      ownerUserId: setup.ownerUserId,
      videoIds: setup.group ? setup.group.memberVideoIds : null,
      locale: setup.locale,
      groupContext: setup.group?.description ?? null,
    });
  } catch (e) {
    const f = toFailure(e);
    return c.json({ error: { message: f.message, type: openAiErrorType(f) } }, f.status);
  }

  const { chatLogId } = await persistTurn(c.env, setup, {
    question: result.queryText,
    answer: result.content,
    citations: result.citations,
    retrievedContexts: result.retrievedContexts,
  });

  const message: Record<string, unknown> = {
    role: "assistant",
    content: result.content,
  };
  if (result.citations?.length) message.citations = withCitationIds(result.citations);
  if (chatLogId !== null) message.chat_log_id = chatLogId;

  await recordUsage(c.env, setup.ownerUserId);

  return c.json({
    id: `chatcmpl-${crypto.randomUUID().replaceAll("-", "")}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message, finish_reason: "stop" }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  });
};

// Django は末尾スラッシュ無しのみ。クライアント互換で両方受ける。
const completionsGuards = [
  requireAuth(bearerApiKeyMethod, apiKeyMethod, jwtMethod),
  chatThrottle,
  csrfProtect,
  requireScope("chat_write"),
] as const;
chatRoutes.post("/api/v1/chat/completions", ...completionsGuards, chatCompletions);
chatRoutes.post("/api/v1/chat/completions/", ...completionsGuards, chatCompletions);
