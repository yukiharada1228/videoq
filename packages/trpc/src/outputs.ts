import { z } from "zod";
import type { inputSchemas } from "./inputs";
import * as models from "./model-schemas";
import { videoListItemSchema, videoSchema } from "./schema";

export const successSchema = z.object({ success: z.literal(true) });
const jobSchema = z.object({ job_id: z.string() });
const urlSchema = z.object({ url: z.string() });
const messageSchema = z.object({ message: z.string() });
const addedItemsSchema = messageSchema.extend({ added_count: z.number(), skipped_count: z.number() });
const deletedItemSchema = z.object({ deleted: z.literal(true), id: z.number() });

/** Runtime output validation and handler output types share this definition. */
export const outputSchemas = {
  "account.me": models.userSchema,
  "account.searchApiKeyStatus": z.object({ has_api_key: z.boolean() }),
  "account.saveSearchApiKey": successSchema,
  "account.deleteSearchApiKey": successSchema,

  "admin.listUsers": models.pageSchema(models.adminUserSchema),
  "admin.getUser": models.adminUserSchema,
  "admin.patchQuota": models.adminUserSchema,
  "admin.patchUsage": models.adminUserSchema,
  "admin.patchFlags": models.adminUserSchema,
  "admin.deleteUser": jobSchema,
  "admin.reindexAll": jobSchema,

  "billing.plans": z.array(models.billingPlanSchema),
  "billing.checkout": urlSchema,
  "billing.portal": urlSchema,

  "chat.send": models.chatMessageSchema,
  "chat.feedback": z.object({ chat_log_id: z.number(), feedback: models.chatFeedbackSchema }),
  "chat.history": models.pageSchema(models.chatHistoryItemSchema),
  "chat.resetHistory": successSchema,
  "chat.analytics": models.chatAnalyticsSchema,

  "evaluation.summary": models.evaluationSummarySchema,
  "evaluation.logs": models.pageSchema(models.chatLogEvaluationSchema),

  "videos.list": models.pageSchema(videoListItemSchema),
  "videos.statusCounts": models.videoStatusCountsSchema,
  "videos.get": videoSchema,
  "videos.requestUpload": models.uploadRequestResponseSchema,
  "videos.confirmUpload": videoSchema,
  "videos.createYoutube": videoSchema,
  "videos.update": videoSchema,
  "videos.replace": videoSchema,
  "videos.delete": successSchema,

  "courses.list": models.pageSchema(models.courseListItemSchema),
  "courses.get": models.courseSchema,
  "courses.shared": models.courseSchema,
  "courses.create": models.courseListItemSchema,
  "courses.update": models.courseSchema,
  "courses.replace": models.courseSchema,
  "courses.delete": successSchema,
  "courses.reorder": z.object({ courseIds: z.array(z.number()) }),
  "courses.createShare": messageSchema.extend({ share_slug: z.string() }),
  "courses.deleteShare": successSchema,

  "courseMemberships.invite": z.object({ results: z.array(models.courseInviteRecipientResultSchema) }),
  "courseMemberships.participants": models.courseParticipantsSchema,
  "courseMemberships.preview": models.courseInvitationPreviewSchema,
  "courseMemberships.accept": z.object({ course_id: z.number(), status: z.literal("accepted") }),
  "courseMemberships.decline": z.object({ status: z.literal("declined") }),
  "courseMemberships.resend": z.object({ delivery_status: models.courseInvitationDeliveryStatusSchema }),
  "courseMemberships.revoke": successSchema,
  "courseMemberships.removeMember": successSchema,
  "courseMemberships.leave": successSchema,

  "memberships.addTags": addedItemsSchema,
  "memberships.removeTag": messageSchema,
  "memberships.reorderVideos": messageSchema,
  "memberships.addVideos": addedItemsSchema,
  "memberships.addVideo": messageSchema.extend({ id: z.number(), reused: z.boolean() }),
  "memberships.removeVideo": successSchema,

  "tags.list": models.pageSchema(models.tagSchema),
  "tags.get": models.tagDetailSchema,
  "tags.create": models.tagSchema,
  "tags.update": models.tagSchema,
  "tags.replace": models.tagSchema,
  "tags.delete": successSchema,

  "plog.graph": models.plogGraphSchema,
  "plog.learnerState": z.object({ states: z.array(models.plogLearnerStateSchema) }),
  "plog.resetLearnerState": z.object({ deleted: z.number() }),
  "plog.rebuild": z.object({ video_id: z.number(), status: z.string(), job_id: z.number() }),
  "plog.createConcept": models.plogConceptSchema,
  "plog.updateConcept": models.plogConceptSchema,
  "plog.deleteConcept": deletedItemSchema,
  "plog.mergeConcepts": models.plogConceptSchema,
  "plog.updateLearningObject": models.plogConceptSchema,
  "plog.createEdge": models.plogEdgeSchema,
  "plog.updateEdge": models.plogEdgeSchema,
  "plog.deleteEdge": deletedItemSchema,
} satisfies Record<keyof typeof inputSchemas, z.ZodType>;
