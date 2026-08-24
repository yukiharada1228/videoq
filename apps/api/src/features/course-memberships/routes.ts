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
  groupParamSchema,
  groupParticipantsSchema,
  invitationDeliveryStatusSchema,
  invitationOwnerParamsSchema,
  invitationPreviewSchema,
  invitationTokenParamSchema,
  inviteRecipientResultSchema,
  memberOwnerParamsSchema,
} from "./schemas";
import * as groupMembershipService from "./service";
import { processExternalTasks } from "../../lib/external-tasks";

export const groupMembershipRoutes = createFeatureRouter();

const auth = requireAuth(apiKeyMethod, sessionMethod);
const writeGuards = [auth, requireScope("write")] as const;

/**
 * トークンを URL に載せるエンドポイント（プレビュー・承認・辞退）の共通スロットル。
 * プレビューは未認証で到達できるため、IP 単位の制限が唯一の歯止めになる。
 */
const invitationTokenThrottle = createMiddleware<AppEnv>(async (c, next) => {
  const denied = await enforceThrottles(c.env, [
    { scope: "group_invitation_token_ip", ident: clientIp(c) },
    {
      scope: "group_invitation_decision_user",
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
  path: "/groups/{groupId}/invitations",
  tags: ["Group memberships"],
  summary: "Invite group members by email (bulk)",
  middleware: [...writeGuards] as const,
  request: {
    params: groupParamSchema,
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

groupMembershipRoutes.openapi(batchInviteRoute, async (c) => {
  const userId = c.var.userId!;
  const { groupId } = c.req.valid("param");
  const { emails } = c.req.valid("json");
  // スパム対策の単位はリクエスト数ではなく宛先数。無効・重複アドレスも
  // 枠を消費させ、ゴミを混ぜて送信枠を稼げないようにする。
  const denied = await enforceThrottles(c.env, [
    { scope: "group_invitation_user", ident: userId, cost: emails.length },
    { scope: "group_invitation_group", ident: String(groupId), cost: emails.length },
  ]);
  if (denied) return throttledResponse(c, denied);

  const result = await groupMembershipService.inviteGroupMembers(
    c.env,
    groupId,
    userId,
    emails,
  );
  if ("notFound" in result) throw apiNotFound("Group not found");
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
  path: "/groups/{groupId}/participants",
  tags: ["Group memberships"],
  summary: "List invitations and accepted members",
  middleware: [auth] as const,
  request: { params: groupParamSchema },
  responses: {
    200: jsonResponse(groupParticipantsSchema),
    404: errorResponse("Not found"),
  },
});

groupMembershipRoutes.openapi(participantsRoute, async (c) => {
  const { groupId } = c.req.valid("param");
  const result = await groupMembershipService.getGroupParticipants(
    c.env,
    groupId,
    c.var.userId!,
  );
  if ("notFound" in result) throw apiNotFound("Group not found");
  return c.json(result, 200);
});

const previewRoute = createRoute({
  method: "get",
  path: "/group-invitations/{token}",
  tags: ["Group memberships"],
  summary: "Preview an email-bound group invitation",
  middleware: [invitationTokenThrottle] as const,
  request: { params: invitationTokenParamSchema },
  responses: {
    200: jsonResponse(invitationPreviewSchema),
    404: errorResponse("Not found"),
    429: errorResponse("Rate limited"),
  },
});

groupMembershipRoutes.openapi(previewRoute, async (c) => {
  const { token } = c.req.valid("param");
  const invitation = await groupMembershipService.previewGroupInvitation(c.env, token);
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
  path: "/group-invitations/{token}/accept",
  tags: ["Group memberships"],
  summary: "Accept a group invitation",
  // 認証を先に通してから、IP とユーザーの両方でスロットルする。
  middleware: [...writeGuards, invitationTokenThrottle] as const,
  request: { params: invitationTokenParamSchema },
  responses: {
    200: jsonResponse(z.object({ group_id: z.number().int(), status: z.literal("accepted") })),
    403: errorResponse("Forbidden"),
    404: errorResponse("Not found"),
    409: errorResponse("Conflict"),
    410: errorResponse("Expired"),
    429: errorResponse("Rate limited"),
  },
});

groupMembershipRoutes.openapi(acceptRoute, async (c) => {
  const { token } = c.req.valid("param");
  const result = await groupMembershipService.acceptInvitation(
    c.env,
    token,
    c.var.userId!,
  );
  if (!("ok" in result)) throwDecisionError(result);
  return c.json({ group_id: result.groupId, status: "accepted" as const }, 200);
});

const declineRoute = createRoute({
  method: "post",
  path: "/group-invitations/{token}/decline",
  tags: ["Group memberships"],
  summary: "Decline a group invitation",
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

groupMembershipRoutes.openapi(declineRoute, async (c) => {
  const { token } = c.req.valid("param");
  const result = await groupMembershipService.declineInvitation(
    c.env,
    token,
    c.var.userId!,
  );
  if (!("ok" in result)) throwDecisionError(result);
  return c.json({ status: "declined" as const }, 200);
});

const resendRoute = createRoute({
  method: "post",
  path: "/groups/{groupId}/invitations/{invitationId}/resend",
  tags: ["Group memberships"],
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

groupMembershipRoutes.openapi(resendRoute, async (c) => {
  const { groupId, invitationId } = c.req.valid("param");
  const denied = await enforceThrottles(c.env, [
    { scope: "group_invitation_resend", ident: String(invitationId) },
  ]);
  if (denied) return throttledResponse(c, denied);
  const result = await groupMembershipService.resendInvitation(
    c.env,
    groupId,
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
  path: "/groups/{groupId}/invitations/{invitationId}",
  tags: ["Group memberships"],
  summary: "Revoke a pending invitation",
  middleware: [...writeGuards] as const,
  request: { params: invitationOwnerParamsSchema },
  responses: {
    204: { description: "Revoked" },
    404: errorResponse("Not found"),
    409: errorResponse("Conflict"),
  },
});

groupMembershipRoutes.openapi(revokeRoute, async (c) => {
  const { groupId, invitationId } = c.req.valid("param");
  const result = await groupMembershipService.revokeInvitation(
    c.env,
    groupId,
    invitationId,
    c.var.userId!,
  );
  if ("notFound" in result) throw apiNotFound("Invitation not found");
  if ("invalidState" in result) throwDecisionError(result);
  return c.body(null, 204);
});

const removeMemberRoute = createRoute({
  method: "delete",
  path: "/groups/{groupId}/members/{userId}",
  tags: ["Group memberships"],
  summary: "Remove an accepted group member",
  middleware: [...writeGuards] as const,
  request: { params: memberOwnerParamsSchema },
  responses: {
    204: { description: "Removed" },
    404: errorResponse("Not found"),
  },
});

groupMembershipRoutes.openapi(removeMemberRoute, async (c) => {
  const { groupId, userId } = c.req.valid("param");
  const result = await groupMembershipService.removeMember(
    c.env,
    groupId,
    userId,
    c.var.userId!,
  );
  if ("notFound" in result) throw apiNotFound("Member not found");
  return c.body(null, 204);
});

const leaveRoute = createRoute({
  method: "delete",
  path: "/groups/{groupId}/membership",
  tags: ["Group memberships"],
  summary: "Leave a joined group",
  middleware: [...writeGuards] as const,
  request: { params: groupParamSchema },
  responses: {
    204: { description: "Left" },
    404: errorResponse("Not found"),
  },
});

groupMembershipRoutes.openapi(leaveRoute, async (c) => {
  const { groupId } = c.req.valid("param");
  const result = await groupMembershipService.leaveGroup(c.env, groupId, c.var.userId!);
  if ("notFound" in result) throw apiNotFound("Membership not found");
  return c.body(null, 204);
});
