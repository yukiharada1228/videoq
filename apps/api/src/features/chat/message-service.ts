import {
  getGroupWithMembers,
  createChatLog,
  type GroupChatContext,
} from "../../repositories/chat-repository";
import { checkAiAnswersLimit, recordAiAnswerUsage } from "../../repositories/quota-repository";
import { enqueueEvaluateChatLog } from "../../lib/jobs";
import { LlmConfigurationError } from "../../lib/openai";
import { PlogNotReadyError, runStudy, streamStudy } from "../../lib/plog-study";
import { runRag, streamRag, type RagCitation } from "../../lib/rag";
import type { Bindings } from "../../types/bindings";
import type { ChatMessageBody, OpenAiCompletionBody } from "./schemas";

export type JsonResult = {
  kind: "json";
  status: number;
  body: unknown;
};

/** Normalized chat request after Zod validation. */
export type ChatRequestInput = {
  messages: { role: string; content: string }[];
  groupId: number | null;
  mode: "qa" | "study";
  studySessionId: string | null;
};

/** ドメイン例外に対応するエラー記述。ストリーム/非ストリームで表現を変える。 */
export type ChatFailure = {
  streamCode: string;
  status: 400 | 403 | 404 | 409 | 500;
  code: string;
  message: string;
};

export const failures = {
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
    message:
      "AI chat is unavailable: account storage is over the configured limit.",
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

export type ChatSetup = {
  ownerUserId: number;
  group: GroupChatContext | null;
  isShared: boolean;
  locale: string | null;
};

export function toChatRequestInput(body: ChatMessageBody): ChatRequestInput {
  return {
    messages: body.messages,
    groupId: body.group_id ?? null,
    mode: body.mode ?? "qa",
    studySessionId: body.study_session_id ?? null,
  };
}

/** LLM 呼び出し前の共通セットアップ（group/owner/quota）。 */
export async function setupChat(
  env: Bindings,
  opts: {
    userId: number | null;
    req: ChatRequestInput;
    shareSlug: string | null;
    locale: string | null;
  },
): Promise<{ ok: true; setup: ChatSetup } | { ok: false; failure: ChatFailure }> {
  const isShared = opts.shareSlug !== null;
  const userId = opts.userId;

  if (opts.req.messages.length === 0) {
    return { ok: false, failure: failures.invalidRequest("Messages are empty.") };
  }
  if (isShared && opts.req.groupId === null) {
    return {
      ok: false,
      failure: failures.invalidRequest("Group ID not specified."),
    };
  }

  let group: GroupChatContext | null = null;
  if (opts.req.groupId !== null) {
    group = await getGroupWithMembers(env, {
      groupId: opts.req.groupId,
      userId: isShared && opts.shareSlug ? null : userId,
      shareToken: isShared && opts.shareSlug ? opts.shareSlug : null,
    });
    if (!group) return { ok: false, failure: failures.notFound("Group") };
  }

  const ownerUserId = isShared && group ? group.userId : userId;
  if (ownerUserId === null) {
    return {
      ok: false,
      failure: failures.permissionDenied(
        "Authentication is required to send messages.",
      ),
    };
  }

  const quota = await checkAiAnswersLimit(env, ownerUserId);
  if ("overQuota" in quota) return { ok: false, failure: failures.overQuota() };
  if ("exceeded" in quota) {
    return { ok: false, failure: failures.answersLimit(quota.limit) };
  }

  return {
    ok: true,
    setup: {
      ownerUserId,
      group,
      isShared,
      locale: opts.locale,
    },
  };
}

export const toFailure = (e: unknown): ChatFailure => {
  if (e instanceof PlogNotReadyError) return failures.plogNotReady(e.message);
  if (e instanceof LlmConfigurationError) {
    return failures.llmConfiguration(e.message);
  }
  return failures.llmProvider();
};

export const withCitationIds = (citations: readonly RagCitation[]) =>
  citations.map((v, i) => ({ id: i + 1, ...v }));

export async function persistTurn(
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
  await enqueueEvaluateChatLog(env, log.id);
  return { chatLogId: log.id, feedback: log.feedback };
}

export const recordUsage = (env: Bindings, userId: number) =>
  recordAiAnswerUsage(env, userId);

/** ドメイン例外 → OpenAI error.type。 */
export const openAiErrorType = (f: ChatFailure): string => {
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

export function requestLocaleFromHeader(
  acceptLanguage: string | undefined,
): string | null {
  const header = acceptLanguage ?? "";
  if (!header) return null;
  return header.split(",")[0].split(";")[0].trim() || null;
}

/** POST /api/chat/messages */
export async function sendChatMessage(
  env: Bindings,
  opts: {
    userId: number | null;
    body: ChatMessageBody;
    shareSlug: string | null;
    locale: string | null;
  },
): Promise<JsonResult> {
  const req = toChatRequestInput(opts.body);

  const prepared = await setupChat(env, {
    userId: opts.userId,
    req,
    shareSlug: opts.shareSlug,
    locale: opts.locale,
  });
  if (!prepared.ok) {
    const f = prepared.failure;
    return {
      kind: "json",
      status: f.status,
      body: { error: { code: f.code, message: f.message } },
    };
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
    if (req.mode === "study") {
      result = await runStudy(env, {
        messages: req.messages,
        videoIds,
        locale: setup.locale,
        studySessionId: req.studySessionId,
      });
    } else {
      result = await runRag(env, {
        messages: req.messages,
        ownerUserId: setup.ownerUserId,
        videoIds,
        locale: setup.locale,
        groupContext: setup.group?.description ?? null,
      });
    }
  } catch (e) {
    const f = toFailure(e);
    return {
      kind: "json",
      status: f.status,
      body: { error: { code: f.code, message: f.message } },
    };
  }

  const { chatLogId, feedback } = await persistTurn(env, setup, {
    question: result.queryText,
    answer: result.content,
    citations: result.citations,
    retrievedContexts: result.retrievedContexts,
  });

  const body: Record<string, unknown> = {
    role: "assistant",
    content: result.content,
  };
  if (req.groupId !== null && result.citations?.length) {
    body.citations = withCitationIds(result.citations);
  }
  if (chatLogId !== null) {
    body.chat_log_id = chatLogId;
    body.feedback = feedback;
  }

  await recordUsage(env, setup.ownerUserId);
  return { kind: "json", status: 200, body };
}

export type SseEventWriter = (data: unknown) => Promise<void>;

/** POST /api/chat/messages/stream */
export async function streamChatMessage(
  env: Bindings,
  opts: {
    userId: number | null;
    body: ChatMessageBody;
    shareSlug: string | null;
    locale: string | null;
    clientSignal?: AbortSignal;
  },
): Promise<
  JsonResult | {
    kind: "sse";
    write: (send: SseEventWriter) => Promise<void>;
  }
> {
  const req = toChatRequestInput(opts.body);

  const prepared = await setupChat(env, {
    userId: opts.userId,
    req,
    shareSlug: opts.shareSlug,
    locale: opts.locale,
  });

  const groupId = req.groupId;
  const messages = req.messages;
  const mode = req.mode;
  const studySessionId = req.studySessionId;
  const clientSignal = opts.clientSignal;

  return {
    kind: "sse",
    async write(send) {
      if (!prepared.ok) {
        const failure = prepared.failure;
        await send({
          type: "error",
          code: failure.streamCode,
          message: failure.message,
        });
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
          for await (const chunk of streamStudy(env, {
            messages,
            videoIds,
            locale: setup.locale,
            studySessionId,
          })) {
            if ("text" in chunk) {
              content += chunk.text;
              await send({ type: "content_chunk", text: chunk.text });
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
            env,
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
              await send({ type: "content_chunk", text: chunk.text });
            } else {
              final = chunk.final;
            }
          }
        }
      } catch (error) {
        const failure = toFailure(error);
        await send({
          type: "error",
          code: failure.streamCode,
          message: failure.message,
        });
        return;
      }

      const { chatLogId, feedback } = await persistTurn(env, setup, {
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
      await send(done);
      await recordUsage(env, setup.ownerUserId);
    },
  };
}

/** POST /api/v1/chat/completions */
export async function openAiChatCompletions(
  env: Bindings,
  opts: {
    userId: number | null;
    body: OpenAiCompletionBody;
    localeFallback: string | null;
  },
): Promise<JsonResult> {
  const { model, messages, group_id: groupId, language } = opts.body;

  const prepared = await setupChat(env, {
    userId: opts.userId,
    req: {
      messages,
      groupId: groupId ?? null,
      mode: "qa",
      studySessionId: null,
    },
    shareSlug: null,
    locale: language ?? opts.localeFallback,
  });
  if (!prepared.ok) {
    const f = prepared.failure;
    return {
      kind: "json",
      status: f.status,
      body: { error: { message: f.message, type: openAiErrorType(f) } },
    };
  }
  const setup = prepared.setup;

  let result: Awaited<ReturnType<typeof runRag>>;
  try {
    result = await runRag(env, {
      messages,
      ownerUserId: setup.ownerUserId,
      videoIds: setup.group ? setup.group.memberVideoIds : null,
      locale: setup.locale,
      groupContext: setup.group?.description ?? null,
    });
  } catch (e) {
    const f = toFailure(e);
    return {
      kind: "json",
      status: f.status,
      body: { error: { message: f.message, type: openAiErrorType(f) } },
    };
  }

  const { chatLogId } = await persistTurn(env, setup, {
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

  await recordUsage(env, setup.ownerUserId);

  return {
    kind: "json",
    status: 200,
    body: {
      id: `chatcmpl-${crypto.randomUUID().replaceAll("-", "")}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, message, finish_reason: "stop" }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    },
  };
}
