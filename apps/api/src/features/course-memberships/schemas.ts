import { z } from "../../shared/openapi";

export const invitationStatusSchema = z.enum([
  "pending",
  "accepted",
  "declined",
  "expired",
  "revoked",
]);

export const invitationDeliveryStatusSchema = z.enum(["queued", "sent", "failed"]);

// 送信は external task に委譲するため、レスポンス時点では配送結果は確定しない。
// 実際の sent/failed は participants の delivery_status で確認する。
export const inviteResultStatusSchema = z.enum([
  "queued",
  "already_member",
  "already_invited",
  "invalid",
  "duplicate",
]);

export const batchInviteSchema = z
  .object({
    // Keep raw malformed values available for per-recipient partial results.
    emails: z.array(z.string().max(1024)).min(1).max(100),
  })
  .openapi("CourseBatchInvite");

export const inviteRecipientResultSchema = z
  .object({
    email: z.string(),
    status: inviteResultStatusSchema,
    invitation_id: z.number().int().positive().optional(),
  })
  .openapi("CourseInviteRecipientResult");

export const invitationListItemSchema = z
  .object({
    id: z.number().int().positive(),
    email: z.string(),
    status: invitationStatusSchema,
    delivery_status: invitationDeliveryStatusSchema,
    expires_at: z.string(),
    created_at: z.string(),
    last_sent_at: z.string().nullable(),
    send_attempts: z.number().int().nonnegative(),
  })
  .openapi("CourseInvitationListItem");

export const courseUserMemberSchema = z
  .object({
    user_id: z.string(),
    username: z.string(),
    email: z.string(),
    joined_at: z.string(),
  })
  .openapi("CourseUserMember");

export const courseParticipantsSchema = z
  .object({
    invitations: z.array(invitationListItemSchema),
    members: z.array(courseUserMemberSchema),
  })
  .openapi("CourseParticipants");

export const invitationPreviewSchema = z
  .object({
    course_id: z.number().int().positive(),
    course_name: z.string(),
    inviter_name: z.string(),
    email_hint: z.string(),
    status: invitationStatusSchema,
    expires_at: z.string(),
  })
  .openapi("CourseInvitationPreview");

export const courseParamSchema = z.object({
  courseId: z.coerce.number().int().positive(),
});

export const invitationOwnerParamsSchema = z.object({
  courseId: z.coerce.number().int().positive(),
  invitationId: z.coerce.number().int().positive(),
});

export const memberOwnerParamsSchema = z.object({
  courseId: z.coerce.number().int().positive(),
  userId: z.string().min(1),
});

export const invitationTokenParamSchema = z.object({ token: z.string().min(1).max(256) });
