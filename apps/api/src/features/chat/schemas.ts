import { z } from "../../shared/openapi";
import { paginationQuerySchema } from "../../shared/pagination";

export const chatCourseParamSchema = z.object({
  courseId: z.coerce.number().int().positive(),
});

export const chatLogParamSchema = z.object({
  logId: z.coerce.number().int().positive(),
});

export const chatHistoryQuerySchema = paginationQuerySchema.extend({
  download: z.enum(["csv"]).optional(),
  share_slug: z.string().optional(),
  share_token: z.string().optional(),
});

export const chatCitationSchema = z.object({
  id: z.number().int(),
  video_id: z.number().int(),
  title: z.string(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
});

export const chatLogItemSchema = z
  .object({
    id: z.number().int(),
    course: z.number().int(),
    asked_by: z
      .object({
        user_id: z.string(),
        username: z.string(),
        email: z.string(),
      })
      .nullable(),
    question: z.string(),
    answer: z.string(),
    citations: z.array(chatCitationSchema),
    is_shared_origin: z.boolean(),
    feedback: z.string().nullable(),
    created_at: z.string(),
  })
  .openapi("ChatLogItem");

export const chatAnalyticsSchema = z
  .object({
    summary: z.object({
      total_questions: z.number().int(),
      date_range: z.object({
        first: z.string().nullable(),
        last: z.string().nullable(),
      }),
    }),
    time_series: z.array(
      z.object({ date: z.string(), count: z.number().int() }),
    ),
    feedback: z.object({
      good: z.number().int(),
      bad: z.number().int(),
      none: z.number().int(),
    }),
  })
  .openapi("ChatAnalytics");

/** feedback 値の正規化は handler 側（"" / 欠落 → null）。 */
export const feedbackBodySchema = z
  .object({
    feedback: z.unknown().optional(),
  })
  .openapi("ChatFeedbackBody");

export const feedbackResponseSchema = z
  .object({
    chat_log_id: z.number().int(),
    feedback: z.string().nullable(),
  })
  .openapi("ChatFeedbackResponse");

const chatMessageItemSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().trim().min(1),
});

const optionalCourseId = z.coerce.number().int().nullable().optional();

export const chatMessageBodySchema = z
  .object({
    messages: z.array(chatMessageItemSchema).min(1),
    course_id: optionalCourseId,
    mode: z.enum(["qa", "study"]).optional().default("qa"),
    study_session_id: z.string().max(128).nullable().optional(),
  })
  .openapi("ChatMessageBody");

export type ChatMessageBody = z.infer<typeof chatMessageBodySchema>;

export const openAiCompletionBodySchema = z
  .object({
    model: z.string().trim().min(1).optional().default("videoq"),
    messages: z.array(chatMessageItemSchema).min(1),
    course_id: optionalCourseId,
    language: z.string().trim().min(1).nullable().optional(),
    // Accepted but unused (OpenAI SDK fields).
    temperature: z.number().optional(),
    max_tokens: z.number().int().optional(),
    top_p: z.number().optional(),
    stream: z.boolean().optional(),
  })
  .openapi("OpenAiChatCompletionBody");

export type OpenAiCompletionBody = z.infer<typeof openAiCompletionBodySchema>;

export const openAiCompletionResponseSchema = z
  .object({
    id: z.string(),
    object: z.literal("chat.completion"),
    created: z.number().int(),
    model: z.string(),
    choices: z.array(
      z.object({
        index: z.number().int(),
        message: z.record(z.string(), z.unknown()),
        finish_reason: z.string(),
      }),
    ),
    usage: z.object({
      prompt_tokens: z.number().int(),
      completion_tokens: z.number().int(),
      total_tokens: z.number().int(),
    }),
  })
  .openapi("OpenAiChatCompletion");
