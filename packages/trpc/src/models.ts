import type { z } from "zod";
import type * as models from "./model-schemas";
import type * as shared from "./schema";

/** Public DTOs are inferred from the same schemas used for output validation. */
export interface Page<T> {
  data: T[];
  meta: z.output<typeof models.paginationMetaSchema>;
}

export type User = z.output<typeof models.userSchema>;
export type AdminUser = z.output<typeof models.adminUserSchema>;
export type BillingPlan = z.output<typeof models.billingPlanSchema>;
export type Citation = z.output<typeof models.citationSchema>;
export type ChatMessage = z.output<typeof models.chatMessageSchema>;
export type ChatHistoryItem = z.output<typeof models.chatHistoryItemSchema>;
export type ChatAnalytics = z.output<typeof models.chatAnalyticsSchema>;
export type EvaluationSummary = z.output<typeof models.evaluationSummarySchema>;
export type ChatLogEvaluation = z.output<typeof models.chatLogEvaluationSchema>;
export type VideoStatus = z.output<typeof shared.videoStatusSchema>;
export type VideoSourceType = z.output<typeof shared.videoSourceTypeSchema>;
export type VideoTag = z.output<typeof shared.videoTagSchema>;
export type VideoListItem = z.output<typeof shared.videoListItemSchema>;
export type Video = z.output<typeof shared.videoSchema>;
export type VideoStatusCounts = z.output<typeof models.videoStatusCountsSchema>;
export type UploadRequestResponse = z.output<typeof models.uploadRequestResponseSchema>;
export type VideoInCourse = z.output<typeof models.videoInCourseSchema>;
export type CourseListItem = z.output<typeof models.courseListItemSchema>;
export type Course = z.output<typeof models.courseSchema>;
export type CourseInvitationStatus = z.output<typeof models.courseInvitationStatusSchema>;
export type CourseInvitationDeliveryStatus = z.output<typeof models.courseInvitationDeliveryStatusSchema>;
export type CourseInviteRecipientResult = z.output<typeof models.courseInviteRecipientResultSchema>;
export type CourseInvitationListItem = z.output<typeof models.courseInvitationListItemSchema>;
export type CourseUserMember = z.output<typeof models.courseUserMemberSchema>;
export type CourseParticipants = z.output<typeof models.courseParticipantsSchema>;
export type CourseInvitationPreview = z.output<typeof models.courseInvitationPreviewSchema>;
export type Tag = z.output<typeof models.tagSchema>;
export type TagDetail = z.output<typeof models.tagDetailSchema>;
export type PlogWaypoint = z.output<typeof models.plogWaypointSchema>;
export type PlogConcept = z.output<typeof models.plogConceptSchema>;
export type PlogEdge = z.output<typeof models.plogEdgeSchema>;
export type PlogGraph = z.output<typeof models.plogGraphSchema>;
export type PlogLearnerState = z.output<typeof models.plogLearnerStateSchema>;
export type TagPage = Page<Tag>;
export type CoursePage = Page<CourseListItem>;
