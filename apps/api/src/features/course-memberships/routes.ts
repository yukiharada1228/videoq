import {
  apiKeyMethod,
  requireAuth,
  requireScope,
  sessionMethod,
} from "../../middleware/auth";
import {
  createFeatureRouter,
  createRoute,
  errorResponse,
  jsonResponse,
  z,
} from "../../shared/openapi";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { apiBadRequest, apiNotFound, ApiError } from "../../shared/errors";
import {
  clientIp,
  enforceThrottles,
  throttledResponse,
} from "../../lib/rate-limit";
import type { AppEnv } from "../../types/bindings";
import {
  batchInviteSchema,
  courseParamSchema,
  courseParticipantsSchema,
  invitationDeliveryStatusSchema,
  invitationOwnerParamsSchema,
  invitationPreviewSchema,
  invitationTokenParamSchema,
  inviteRecipientResultSchema,
  memberOwnerParamsSchema,
} from "./schemas";
import * as courseMembershipService from "./service";
import { processExternalTasks } from "../../lib/external-tasks";

export const courseMembershipRoutes = createFeatureRouter();

const auth = requireAuth(apiKeyMethod, sessionMethod);
const writeGuards = [auth, requireScope("write")] as const;

/**
 * トークンを URL に載せるエンドポイント（プレビュー・承認・辞退）の共通スロットル。
 * プレビューは未認証で到達できるため、IP 単位の制限が唯一の歯止めになる。
 */
const invitationTokenThrottle = createMiddleware<AppEnv>(async (c, next) => {
  const denied = await enforceThrottles(c.env, [
    { scope: "course_invitation_token_ip", ident: clientIp(c) },
    {
      scope: "course_invitation_decision_user",
      ident: c.var.userId != null ? String(c.var.userId) : null,
    },
  ]);
  if (denied) return throttledResponse(c, denied);
  await next();
});

/**
 * 積んだ配送タスクをレスポンス後に流す。
 *
 * タスクは既にコミット済みなので、ここで取りこぼしても 5 分ごとの
 * 配送回復 cron が回収する。waitUntil が使えない実行環境（テスト等）では
 * 送信を試みず、そのまま cron に委ねる。
 */
function flushInvitationEmails(c: Context<AppEnv>, count: number): void {
  if (count <= 0) return;
  let executionCtx;
  try {
    executionCtx = c.executionCtx;
  } catch {
    // ExecutionContext が無い環境では送信を始めず、cron 側の回収に委ねる。
    // 誰も待たない非同期処理をここで起こさないことが重要。
    return;
  }
  executionCtx.waitUntil(
    processExternalTasks(c.env, { limit: count }).catch((error) => {
      console.error(
        JSON.stringify({
          event: "invitation_email_flush_failed",
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }),
  );
}

const batchInviteRoute = createRoute({
  method: "post",
  path: "/courses/{courseId}/invitations",
  tags: ["Course memberships"],
  summary: "Invite course members by email (bulk)",
  middleware: [...writeGuards] as const,
  request: {
    params: courseParamSchema,
    body: {
      content: { "application/json": { schema: batchInviteSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonResponse(z.object({ results: z.array(inviteRecipientResultSchema) }), "Created"),
    400: errorResponse("Bad request"),
    404: errorResponse("Not found"),
    429: errorResponse("Rate limited"),
  },
});

courseMembershipRoutes.openapi(batchInviteRoute, async (c) => {
  const userId = c.var.userId!;
  const { courseId } = c.req.valid("param");
  const { emails } = c.req.valid("json");
  // スパム対策の単位はリクエスト数ではなく宛先数。無効・重複アドレスも
  // 枠を消費させ、ゴミを混ぜて送信枠を稼げないようにする。
  const denied = await enforceThrottles(c.env, [
    { scope: "course_invitation_user", ident: userId, cost: emails.length },
    { scope: "course_invitation_course", ident: String(courseId), cost: emails.length },
  ]);
  if (denied) return throttledResponse(c, denied);

  const result = await courseMembershipService.inviteCourseMembers(
    c.env,
    courseId,
    userId,
    emails,
  );
  if ("notFound" in result) throw apiNotFound("Course not found");
  if ("tooMany" in result) {
    throw apiBadRequest(
      `At most ${result.limit} recipients can be invited at once.`,
      "INVITATION_BATCH_LIMIT",
      { limit: result.limit },
    );
  }
  flushInvitationEmails(
    c,
    result.results.filter((r) => r.status === "queued").length,
  );
  return c.json({ results: result.results }, 201);
});

const participantsRoute = createRoute({
  method: "get",
  path: "/courses/{courseId}/participants",
  tags: ["Course memberships"],
  summary: "List invitations and accepted members",
  middleware: [auth] as const,
  request: { params: courseParamSchema },
  responses: {
    200: jsonResponse(courseParticipantsSchema),
    404: errorResponse("Not found"),
  },
});

courseMembershipRoutes.openapi(participantsRoute, async (c) => {
  const { courseId } = c.req.valid("param");
  const result = await courseMembershipService.getCourseParticipants(
    c.env,
    courseId,
    c.var.userId!,
  );
  if ("notFound" in result) throw apiNotFound("Course not found");
  return c.json(result, 200);
});

const previewRoute = createRoute({
  method: "get",
  path: "/course-invitations/{token}",
  tags: ["Course memberships"],
  summary: "Preview an email-bound course invitation",
  middleware: [invitationTokenThrottle] as const,
  request: { params: invitationTokenParamSchema },
  responses: {
    200: jsonResponse(invitationPreviewSchema),
    404: errorResponse("Not found"),
    429: errorResponse("Rate limited"),
  },
});

courseMembershipRoutes.openapi(previewRoute, async (c) => {
  const { token } = c.req.valid("param");
  const invitation = await courseMembershipService.previewCourseInvitation(c.env, token);
  if (!invitation) throw apiNotFound("Invitation not found");
  return c.json(invitation, 200);
});

function throwDecisionError(result: Record<string, unknown>): never {
  if ("notFound" in result) throw apiNotFound("Invitation not found");
  if ("emailUnverified" in result) {
    throw new ApiError(
      403,
      "INVITATION_EMAIL_UNVERIFIED",
      "Verify the invited email address before responding to this invitation.",
    );
  }
  if ("emailMismatch" in result) {
    throw new ApiError(
      403,
      "INVITATION_EMAIL_MISMATCH",
      "Sign in with the account matching the invited email address.",
    );
  }
  if ("expired" in result) {
    throw new ApiError(410, "INVITATION_EXPIRED", "This invitation has expired.");
  }
  if ("invalidState" in result) {
    throw new ApiError(
      409,
      "INVITATION_NOT_PENDING",
      `This invitation is ${String(result.invalidState)}.`,
    );
  }
  throw new ApiError(409, "INVITATION_INVALID", "This invitation cannot be used.");
}

const acceptRoute = createRoute({
  method: "post",
  path: "/course-invitations/{token}/accept",
  tags: ["Course memberships"],
  summary: "Accept a course invitation",
  // 認証を先に通してから、IP とユーザーの両方でスロットルする。
  middleware: [...writeGuards, invitationTokenThrottle] as const,
  request: { params: invitationTokenParamSchema },
  responses: {
    200: jsonResponse(z.object({ course_id: z.number().int(), status: z.literal("accepted") })),
    403: errorResponse("Forbidden"),
    404: errorResponse("Not found"),
    409: errorResponse("Conflict"),
    410: errorResponse("Expired"),
    429: errorResponse("Rate limited"),
  },
});

courseMembershipRoutes.openapi(acceptRoute, async (c) => {
  const { token } = c.req.valid("param");
  const result = await courseMembershipService.acceptInvitation(
    c.env,
    token,
    c.var.userId!,
  );
  if (!("ok" in result)) throwDecisionError(result);
  return c.json({ course_id: result.courseId, status: "accepted" as const }, 200);
});

const declineRoute = createRoute({
  method: "post",
  path: "/course-invitations/{token}/decline",
  tags: ["Course memberships"],
  summary: "Decline a course invitation",
  middleware: [...writeGuards, invitationTokenThrottle] as const,
  request: { params: invitationTokenParamSchema },
  responses: {
    200: jsonResponse(z.object({ status: z.literal("declined") })),
    403: errorResponse("Forbidden"),
    404: errorResponse("Not found"),
    409: errorResponse("Conflict"),
    410: errorResponse("Expired"),
    429: errorResponse("Rate limited"),
  },
});

courseMembershipRoutes.openapi(declineRoute, async (c) => {
  const { token } = c.req.valid("param");
  const result = await courseMembershipService.declineInvitation(
    c.env,
    token,
    c.var.userId!,
  );
  if (!("ok" in result)) throwDecisionError(result);
  return c.json({ status: "declined" as const }, 200);
});

const resendRoute = createRoute({
  method: "post",
  path: "/courses/{courseId}/invitations/{invitationId}/resend",
  tags: ["Course memberships"],
  summary: "Rotate and resend a pending invitation",
  middleware: [...writeGuards] as const,
  request: { params: invitationOwnerParamsSchema },
  responses: {
    200: jsonResponse(z.object({ delivery_status: invitationDeliveryStatusSchema })),
    404: errorResponse("Not found"),
    409: errorResponse("Conflict"),
    429: errorResponse("Rate limited"),
  },
});

courseMembershipRoutes.openapi(resendRoute, async (c) => {
  const { courseId, invitationId } = c.req.valid("param");
  const denied = await enforceThrottles(c.env, [
    { scope: "course_invitation_resend", ident: String(invitationId) },
  ]);
  if (denied) return throttledResponse(c, denied);
  const result = await courseMembershipService.resendInvitation(
    c.env,
    courseId,
    invitationId,
    c.var.userId!,
  );
  if ("notFound" in result) throw apiNotFound("Invitation not found");
  if ("invalidState" in result) throwDecisionError(result);
  flushInvitationEmails(c, 1);
  return c.json({ delivery_status: result.delivery_status }, 200);
});

const revokeRoute = createRoute({
  method: "delete",
  path: "/courses/{courseId}/invitations/{invitationId}",
  tags: ["Course memberships"],
  summary: "Revoke a pending invitation",
  middleware: [...writeGuards] as const,
  request: { params: invitationOwnerParamsSchema },
  responses: {
    204: { description: "Revoked" },
    404: errorResponse("Not found"),
    409: errorResponse("Conflict"),
  },
});

courseMembershipRoutes.openapi(revokeRoute, async (c) => {
  const { courseId, invitationId } = c.req.valid("param");
  const result = await courseMembershipService.revokeInvitation(
    c.env,
    courseId,
    invitationId,
    c.var.userId!,
  );
  if ("notFound" in result) throw apiNotFound("Invitation not found");
  if ("invalidState" in result) throwDecisionError(result);
  return c.body(null, 204);
});

const removeMemberRoute = createRoute({
  method: "delete",
  path: "/courses/{courseId}/members/{userId}",
  tags: ["Course memberships"],
  summary: "Remove an accepted course member",
  middleware: [...writeGuards] as const,
  request: { params: memberOwnerParamsSchema },
  responses: {
    204: { description: "Removed" },
    404: errorResponse("Not found"),
  },
});

courseMembershipRoutes.openapi(removeMemberRoute, async (c) => {
  const { courseId, userId } = c.req.valid("param");
  const result = await courseMembershipService.removeMember(
    c.env,
    courseId,
    userId,
    c.var.userId!,
  );
  if ("notFound" in result) throw apiNotFound("Member not found");
  return c.body(null, 204);
});

const leaveRoute = createRoute({
  method: "delete",
  path: "/courses/{courseId}/membership",
  tags: ["Course memberships"],
  summary: "Leave a joined course",
  middleware: [...writeGuards] as const,
  request: { params: courseParamSchema },
  responses: {
    204: { description: "Left" },
    404: errorResponse("Not found"),
  },
});

courseMembershipRoutes.openapi(leaveRoute, async (c) => {
  const { courseId } = c.req.valid("param");
  const result = await courseMembershipService.leaveCourse(c.env, courseId, c.var.userId!);
  if ("notFound" in result) throw apiNotFound("Membership not found");
  return c.body(null, 204);
});
