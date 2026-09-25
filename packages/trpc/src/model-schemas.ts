import { z } from "zod";
import { videoListItemSchema, videoSchema } from "./schema";

export const paginationMetaSchema = z.object({
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({ data: z.array(item), meta: paginationMetaSchema });
}

export const userSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string(),
  is_superuser: z.boolean().optional(),
  video_count: z.number(),
  max_video_upload_size_mb: z.number(),
  used_storage_bytes: z.number().optional(),
  storage_limit_bytes: z.number().nullable().optional(),
  used_processing_seconds: z.number().optional(),
  processing_limit_seconds: z.number().nullable().optional(),
  used_ai_answers: z.number().optional(),
  ai_answers_limit: z.number().nullable().optional(),
  is_over_quota: z.boolean().optional(),
  plan_code: z.enum(["free", "basic", "pro"]).optional(),
  subscription_status: z.string().nullable().optional(),
  quota_source: z.enum(["plan", "admin"]).optional(),
});

export const adminUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string(),
  is_active: z.boolean(),
  is_staff: z.boolean(),
  is_superuser: z.boolean(),
  max_video_upload_size_mb: z.number(),
  storage_limit_gb: z.number().nullable(),
  processing_limit_minutes: z.number().nullable(),
  ai_answers_limit: z.number().nullable(),
  used_storage_bytes: z.number(),
  used_processing_seconds: z.number(),
  used_ai_answers: z.number(),
  usage_period_start: z.string().nullable(),
  is_over_quota: z.boolean(),
  plan_code: z.string().optional(),
  quota_source: z.enum(["plan", "admin"]).optional(),
});

export const billingPlanSchema = z.object({
  code: z.enum(["free", "basic", "pro"]),
  interval: z.enum(["month", "year"]).nullable(),
  lookup_key: z.string().nullable(),
  amount_yen: z.number(),
  currency: z.literal("jpy"),
  entitlements: z.object({
    max_video_upload_size_mb: z.number(),
    storage_limit_gb: z.number(),
    processing_limit_minutes: z.number(),
    ai_answers_limit: z.number(),
  }),
});

export const citationSchema = z.object({
  id: z.number(),
  video_id: z.number(),
  title: z.string(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
});

export const chatFeedbackSchema = z.enum(["good", "bad"]).nullable();

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  citations: z.array(citationSchema).optional(),
  chat_log_id: z.number().optional(),
  feedback: chatFeedbackSchema.optional(),
});

export const chatLogEvaluationSchema = z.object({
  chat_log_id: z.number(),
  status: z.enum(["pending", "completed", "failed"]),
  faithfulness: z.number().nullable(),
  answer_relevancy: z.number().nullable(),
  context_precision: z.number().nullable(),
  error_message: z.string().nullable(),
  evaluated_at: z.string().nullable(),
});

export const chatHistoryItemSchema = z.object({
  id: z.number(),
  course: z.number(),
  asked_by: z.object({ user_id: z.string(), username: z.string(), email: z.string() }).nullable(),
  question: z.string(),
  answer: z.string(),
  citations: z.array(citationSchema).optional(),
  is_shared_origin: z.boolean(),
  feedback: chatFeedbackSchema.optional(),
  created_at: z.string(),
  evaluation: chatLogEvaluationSchema.optional(),
});

export const chatAnalyticsSchema = z.object({
  summary: z.object({
    total_questions: z.number(),
    date_range: z.object({
      first: z.string().nullable().optional(),
      last: z.string().nullable().optional(),
    }),
  }),
  time_series: z.array(z.object({ date: z.string(), count: z.number() })),
  feedback: z.object({ good: z.number(), bad: z.number(), none: z.number() }),
});

export const evaluationSummarySchema = z.object({
  course_id: z.number(),
  evaluated_count: z.number(),
  avg_faithfulness: z.number().nullable(),
  avg_answer_relevancy: z.number().nullable(),
  avg_context_precision: z.number().nullable(),
});

export const videoStatusCountsSchema = z.object({
  total: z.number(),
  completed: z.number(),
  pending: z.number(),
  processing: z.number(),
  indexing: z.number(),
  error: z.number(),
  uploading: z.number(),
});

export const uploadRequestResponseSchema = z.object({
  video: videoSchema,
  upload_url: z.string(),
});

export const videoInCourseSchema = videoListItemSchema.omit({ tags: true }).extend({ order: z.number() });

export const courseListItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
  display_order: z.number(),
  created_at: z.string(),
  video_count: z.number(),
  access_role: z.enum(["owner", "member"]),
});

export const courseSchema = courseListItemSchema.extend({
  updated_at: z.string().optional(),
  videos: z.array(videoInCourseSchema).optional(),
  share_slug: z.string().nullable().optional(),
  access_role: z.enum(["owner", "member", "public"]).optional(),
});

export const courseInvitationStatusSchema = z.enum(["pending", "accepted", "declined", "expired", "revoked"]);
export const courseInvitationDeliveryStatusSchema = z.enum(["queued", "sent", "failed"]);

export const courseInviteRecipientResultSchema = z.object({
  email: z.string(),
  status: z.enum(["queued", "already_member", "already_invited", "invalid", "duplicate"]),
  invitation_id: z.number().optional(),
});

export const courseInvitationListItemSchema = z.object({
  id: z.number(),
  email: z.string(),
  status: courseInvitationStatusSchema,
  delivery_status: courseInvitationDeliveryStatusSchema,
  expires_at: z.string(),
  created_at: z.string(),
  last_sent_at: z.string().nullable(),
  send_attempts: z.number(),
});

export const courseUserMemberSchema = z.object({
  user_id: z.string(),
  username: z.string(),
  email: z.string(),
  joined_at: z.string(),
});

export const courseParticipantsSchema = z.object({
  invitations: z.array(courseInvitationListItemSchema),
  members: z.array(courseUserMemberSchema),
});

export const courseInvitationPreviewSchema = z.object({
  course_id: z.number(),
  course_name: z.string(),
  inviter_name: z.string(),
  email_hint: z.string(),
  status: courseInvitationStatusSchema,
  expires_at: z.string(),
});

export const tagSchema = z.object({
  id: z.number(),
  name: z.string(),
  // Existing tags may still use legacy hex colors; writes use tagColorSchema.
  color: z.string(),
  created_at: z.string(),
  video_count: z.number(),
});

export const tagDetailSchema = tagSchema.extend({ videos: z.array(videoListItemSchema).optional() });
