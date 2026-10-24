import { features } from "../../lib/deployment";
import { authBaseURL } from "../../lib/auth";
import {
  acceptCourseInvitation,
  createPendingCourseInvitations,
  declineCourseInvitation,
  getCourseInvitationByTokenHash,
  revokePendingCourseInvitation,
  rotatePendingCourseInvitation,
} from "../../repositories/course-invitation-repository";
import {
  createInvitationToken,
  hashInvitationToken,
  invitationExpiresAt,
  effectiveInvitationStatus,
  maskInvitationEmail,
  planInvitationEmails,
  resolveInvitationBatchLimit,
} from "../../lib/course-invitations";
import type { Bindings } from "../../types/bindings";

export {
  listCourseParticipants as getCourseParticipants,
  removeCourseUserMember as removeMember,
  leaveCourseMembership as leaveCourse,
} from "../../repositories/course-invitation-repository";

type InviteResultStatus =
  | "queued"
  | "already_member"
  | "already_invited"
  | "invalid"
  | "duplicate";

export type InviteRecipientResult = {
  email: string;
  status: InviteResultStatus;
  invitation_id?: number;
  invitation_url?: string;
};

export async function inviteCourseMembers(
  env: Bindings,
  courseId: number,
  ownerUserId: string,
  rawEmails: readonly string[],
  issuedAt = new Date(),
): Promise<
  | { notFound: true }
  | { tooMany: true; limit: number }
  | { results: InviteRecipientResult[] }
> {
  const limit = resolveInvitationBatchLimit(env.COURSE_INVITATION_BATCH_LIMIT);
  const plan = planInvitationEmails(rawEmails);
  const ready = plan.filter(({ status }) => status === "ready");
  if (ready.length > limit) return { tooMany: true, limit };
  const expiresAt = invitationExpiresAt(issuedAt);
  const manualTokens = new Map<string, string>();
  const prepared = await Promise.all(
    ready.map(async ({ email }) => {
      const token = createInvitationToken();
      if (!features(env).emailDelivery) manualTokens.set(email, token);
      return { email, tokenHash: await hashInvitationToken(token), expiresAt, createdAt: issuedAt };
    }),
  );

  // 招待行と配送タスクを同じtransactionで作る。メール送信はここでは行わない。
  // 最大50通をリクエスト内で送ると、途中でWorkerが終了したときに配信状態が
  // 失われるため、送信は external task 側に完全に委譲する。
  const stored = await createPendingCourseInvitations(
    env,
    courseId,
    ownerUserId,
    prepared,
  );
  if ("notFound" in stored) return { notFound: true };

  const resultByEmail = new Map<string, Omit<InviteRecipientResult, "email">>();
  for (const email of stored.alreadyMemberEmails) {
    resultByEmail.set(email, { status: "already_member" });
  }
  for (const email of stored.alreadyPendingEmails) {
    resultByEmail.set(email, { status: "already_invited" });
  }
  for (const invitation of stored.created) {
    resultByEmail.set(invitation.email, {
      status: "queued",
      invitation_id: invitation.id,
      ...(!features(env).emailDelivery ? { invitation_url: `${authBaseURL(env)}/course-invitations/${manualTokens.get(invitation.email)!}` } : {}),
    });
  }

  const results: InviteRecipientResult[] = plan.map(({ email, status }) =>
    status === "ready"
      ? { email, ...(resultByEmail.get(email) ?? { status: "queued" }) }
      : { email, status },
  );
  return { results };
}

export async function previewCourseInvitation(
  env: Bindings,
  token: string,
  now = new Date(),
) {
  const tokenHash = await hashInvitationToken(token);
  const invitation = await getCourseInvitationByTokenHash(env, tokenHash);
  if (!invitation) return null;
  return {
    course_id: invitation.course_id,
    course_name: invitation.course_name,
    inviter_name: invitation.inviter_name,
    email_hint: maskInvitationEmail(invitation.email),
    status: effectiveInvitationStatus(invitation.status, new Date(invitation.expires_at), now),
    expires_at: invitation.expires_at,
  };
}

export async function acceptInvitation(
  env: Bindings,
  token: string,
  userId: string,
  now = new Date(),
) {
  return acceptCourseInvitation(env, await hashInvitationToken(token), userId, now);
}

export async function declineInvitation(
  env: Bindings,
  token: string,
  userId: string,
  now = new Date(),
) {
  return declineCourseInvitation(env, await hashInvitationToken(token), userId, now);
}

/**
 * 保留中の招待のトークンを失効させ、配送タスクを積み直す。
 * 一括招待と同じ経路に載せるので、送信自体はここでは行わない。
 */
export async function resendInvitation(
  env: Bindings,
  courseId: number,
  invitationId: number,
  ownerUserId: string,
  now = new Date(),
) {
  const token = createInvitationToken();
  const rotated = await rotatePendingCourseInvitation(
    env,
    courseId,
    invitationId,
    ownerUserId,
    await hashInvitationToken(token),
    invitationExpiresAt(now),
    now,
  );
  if ("notFound" in rotated || "invalidState" in rotated) return rotated;
  return { ok: true as const, delivery_status: "queued" as const,
    ...(!features(env).emailDelivery ? { invitation_url: `${authBaseURL(env)}/course-invitations/${token}` } : {}),
  };
}

export function revokeInvitation(
  env: Bindings,
  courseId: number,
  invitationId: number,
  ownerUserId: string,
  now = new Date(),
) {
  return revokePendingCourseInvitation(
    env,
    courseId,
    invitationId,
    ownerUserId,
    now,
  );
}
