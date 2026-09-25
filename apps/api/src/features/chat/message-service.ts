import {
  getCourseWithMembers,
  createChatLog,
  type GroupChatContext,
} from "../../repositories/chat-repository";
import {
  releaseAiAnswerReservation,
  reserveAiAnswerUsage,
  type AiAnswerReservation,
} from "../../repositories/quota-repository";
import { processExternalTaskById } from "../../lib/external-tasks";
import { LlmConfigurationError } from "../../lib/openai";
import { runRag, streamRag, type RagCitation } from "../../lib/rag";
import type { Bindings } from "../../types/bindings";
import type { ChatMessageBody } from "./schemas";
import type { ChatMessage } from "@videoq/trpc";

type ChatSendResult =
  | { status: 200; body: ChatMessage }
  | {
      status: ChatFailure["status"];
      body: { error: { code: string; message: string } };
    };

/** Normalized chat request after Zod validation. */
export type ChatRequestInput = {
  messages: { role: string; content: string }[];
  courseId: number | null;
};

/** ドメイン例外に対応するエラー記述。ストリーム/非ストリームで表現を変える。 */
export type ChatFailure = {
  streamCode: string;
  status: 400 | 403 | 404 | 500;
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
};

export type ChatSetup = {
  ownerUserId: string;
  actorUserId: string;
  quotaReservation: AiAnswerReservation;
  course: GroupChatContext | null;
  isShared: boolean;
  locale: string | null;
};

export function toChatRequestInput(body: ChatMessageBody): ChatRequestInput {
  return {
    messages: body.messages,
    courseId: body.course_id ?? null,
  };
}

/** LLM 呼び出し前の共通セットアップ（course/owner/quota）。 */
export async function setupChat(
  env: Bindings,
  opts: {
    userId: string | null;
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
  if (isShared && opts.req.courseId === null) {
    return {
      ok: false,
      failure: failures.invalidRequest("Course ID not specified."),
    };
  }

  let course: GroupChatContext | null = null;
  if (opts.req.courseId !== null) {
    course = await getCourseWithMembers(env, {
      courseId: opts.req.courseId,
      userId: isShared && opts.shareSlug ? null : userId,
      shareToken: isShared && opts.shareSlug ? opts.shareSlug : null,
    });
    if (!course) return { ok: false, failure: failures.notFound("Course") };
  }

  const ownerUserId = course?.userId ?? userId;
  if (ownerUserId === null) {
    return {
      ok: false,
      failure: failures.permissionDenied(
        "Authentication is required to send messages.",
      ),
    };
  }

  const quota = await reserveAiAnswerUsage(env, ownerUserId);
  if ("overQuota" in quota) return { ok: false, failure: failures.overQuota() };
  if ("exceeded" in quota) {
    return { ok: false, failure: failures.answersLimit(quota.limit) };
  }

  return {
    ok: true,
    setup: {
      ownerUserId,
      actorUserId: isShared ? ownerUserId : (userId ?? ownerUserId),
      quotaReservation: quota.reservation,
      course,
      isShared,
      locale: opts.locale,
    },
  };
}

export const toFailure = (e: unknown): ChatFailure => {
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
  if (!setup.course) return { chatLogId: null, feedback: null };
  const log = await createChatLog(env, {
    userId: setup.actorUserId,
    courseId: setup.course.id,
    question: turn.question,
    answer: turn.answer,
    citations: turn.citations,
    isShared: setup.isShared,
    retrievedContexts: turn.retrievedContexts,
  });
  await processExternalTaskById(env, log.taskId);
  return { chatLogId: log.id, feedback: log.feedback };
}

async function releaseReservedUsage(env: Bindings, setup: ChatSetup): Promise<void> {
  try {
    await releaseAiAnswerReservation(env, setup.quotaReservation);
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "ai_answer_quota_release_failed",
        ownerUserId: setup.ownerUserId,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

export function requestLocaleFromHeader(
  acceptLanguage: string | undefined,
): string | null {
  const header = acceptLanguage ?? "";
  if (!header) return null;
  return header.split(",")[0].split(";")[0].trim() || null;
}

/** Non-streaming `chat.send` procedure. */
export async function sendChatMessage(
  env: Bindings,
  opts: {
    userId: string | null;
    body: ChatMessageBody;
    shareSlug: string | null;
    locale: string | null;
  },
): Promise<ChatSendResult> {
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
      status: f.status,
      body: { error: { code: f.code, message: f.message } },
    };
  }

  const setup = prepared.setup;
  const videoIds = setup.course ? setup.course.memberVideoIds : null;

  let result: {
    content: string;
    queryText: string;
    citations: RagCitation[] | null;
    retrievedContexts: string[];
  };
  try {
    result = await runRag(env, {
      messages: req.messages,
      ownerUserId: setup.ownerUserId,
      videoIds,
      locale: setup.locale,
      courseId: setup.course?.id ?? null,
    });
  } catch (e) {
    await releaseReservedUsage(env, setup);
    const f = toFailure(e);
    return {
      status: f.status,
      body: { error: { code: f.code, message: f.message } },
    };
  }

  try {
    const { chatLogId, feedback } = await persistTurn(env, setup, {
      question: result.queryText,
      answer: result.content,
      citations: result.citations,
      retrievedContexts: result.retrievedContexts,
    });

    const body: ChatMessage = {
      role: "assistant",
      content: result.content,
    };
    if (req.courseId !== null && result.citations?.length) {
      body.citations = withCitationIds(result.citations);
    }
    if (chatLogId !== null) {
      body.chat_log_id = chatLogId;
      body.feedback = feedback === "good" || feedback === "bad" ? feedback : null;
    }

    return { status: 200, body };
  } catch (e) {
    const f = toFailure(e);
    return {
      status: f.status,
      body: { error: { code: f.code, message: f.message } },
    };
  }
}

export type SseEventWriter = (data: unknown) => Promise<void>;

/** POST /api/chat/messages/stream */
export async function streamChatMessage(
  env: Bindings,
  opts: {
    userId: string | null;
    body: ChatMessageBody;
    shareSlug: string | null;
    locale: string | null;
    clientSignal?: AbortSignal;
  },
): Promise<{ write: (send: SseEventWriter) => Promise<void> }> {
  const req = toChatRequestInput(opts.body);

  const prepared = await setupChat(env, {
    userId: opts.userId,
    req,
    shareSlug: opts.shareSlug,
    locale: opts.locale,
  });

  const courseId = req.courseId;
  const messages = req.messages;
  const clientSignal = opts.clientSignal;

  return {
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
      const videoIds = setup.course ? setup.course.memberVideoIds : null;

      let content = "";
      let final: {
        citations: RagCitation[] | null;
        retrievedContexts: string[];
        queryText: string;
      } = { citations: null, retrievedContexts: [], queryText: "" };

      try {
        for await (const chunk of streamRag(
          env,
          {
            messages,
            ownerUserId: setup.ownerUserId,
            videoIds,
            locale: setup.locale,
            courseId: setup.course?.id ?? null,
          },
          clientSignal,
        )) {
          if ("text" in chunk) {
            content += chunk.text;
            await send({ type: "content_chunk", text: chunk.text });
          } else if ("searching" in chunk) {
            // 検索ラウンドの間はトークンが流れないので、進行中であることだけ伝える。
            await send({ type: "searching", query: chunk.searching, search_id: chunk.searchId });
          } else if ("searchCompleted" in chunk) {
            await send({
              type: "search_completed",
              search_id: chunk.searchCompleted.id,
              query: chunk.searchCompleted.query,
              result_count: chunk.searchCompleted.count,
            });
          } else {
            final = chunk.final;
          }
        }
      } catch (error) {
        // 一部でも回答を生成済みなら、上流LLMの実コストも消費済みなので返却しない。
        if (content.length === 0) await releaseReservedUsage(env, setup);
        const failure = toFailure(error);
        await send({
          type: "error",
          code: failure.streamCode,
          message: failure.message,
        });
        return;
      }

      let chatLogId: number | null;
      let feedback: string | null;
      try {
        ({ chatLogId, feedback } = await persistTurn(env, setup, {
          question: final.queryText,
          answer: content,
          citations: final.citations,
          retrievedContexts: final.retrievedContexts,
        }));
      } catch (error) {
        const failure = toFailure(error);
        await send({
          type: "error",
          code: failure.streamCode,
          message: failure.message,
        });
        return;
      }

      const done: Record<string, unknown> = {
        type: "done",
        chat_log_id: chatLogId,
        feedback,
      };
      if (courseId !== null && final.citations?.length) {
        done.citations = withCitationIds(final.citations);
      }
      await send(done);
    },
  };
}
