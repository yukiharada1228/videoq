import {
  acceptGroupInvitation,
  createPendingGroupInvitations,
  declineGroupInvitation,
  getGroupInvitationByTokenHash,
  leaveGroupMembership,
  listGroupParticipants,
  markGroupInvitationExpired,
  recordInvitationDeliveryOutcomes,
  removeGroupUserMember,
  revokePendingGroupInvitation,
  rotatePendingGroupInvitation,
} from "../../repositories/group-invitation-repository";
import {
  createInvitationToken,
  hashInvitationToken,
  invitationExpiresAt,
  isInvitationExpired,
  maskInvitationEmail,
  normalizeInvitationEmail,
  planInvitationEmails,
  resolveInvitationBatchLimit,
} from "../../lib/group-invitations";
import type { Bindings } from "../../types/bindings";

export type InviteResultStatus =
  | "queued"
  | "already_member"
  | "already_invited"
  | "invalid"
  | "duplicate";

export type InviteRecipientResult = {
  email: string;
  status: InviteResultStatus;
  invitation_id?: number;
};

/**
 * 誰も保持していないダミーの token hash。招待行の NOT NULL / UNIQUE を満たしつつ、
 * 実際に配るトークンは配送タスクが送信直前に発行する。
 * これにより平文トークンがDBにもキューにも一切残らない。
 */
function placeholderTokenHash(): Promise<string> {
  return hashInvitationToken(createInvitationToken());
}

export async function inviteGroupMembers(
  env: Bindings,
  groupId: number,
  ownerUserId: string,
  rawEmails: readonly string[],
  issuedAt = new Date(),
): Promise<
  | { notFound: true }
  | { tooMany: true; limit: number }
  | { results: InviteRecipientResult[] }
> {
  const limit = resolveInvitationBatchLimit(env.GROUP_INVITATION_BATCH_LIMIT);
  const plan = planInvitationEmails(rawEmails);
  if (plan.ready.length > limit) return { tooMany: true, limit };
  const prepared = await Promise.all(
    plan.ready.map(async ({ email }) => ({
      email,
      tokenHash: await placeholderTokenHash(),
      expiresAt: invitationExpiresAt(issuedAt),
      createdAt: issuedAt,
    })),
  );

  // 招待行と配送タスクを同じtransactionで作る。メール送信はここでは行わない。
  // 最大50通をリクエスト内で送ると、途中でWorkerが終了したときに配信状態が
  // 失われるため、送信は external task 側に完全に委譲する。
  const stored = await createPendingGroupInvitations(
    env,
    groupId,
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
    });
  }

  const results: InviteRecipientResult[] = [];
  const seen = new Set<string>();
  for (const input of rawEmails) {
    const email = normalizeInvitationEmail(input);
    if (!email) {
      results.push({ email: input, status: "invalid" });
      continue;
    }
    if (seen.has(email)) {
      results.push({ email: input, status: "duplicate" });
      continue;
    }
    seen.add(email);
    results.push({ email, ...(resultByEmail.get(email) ?? { status: "queued" }) });
  }
  return { results };
}

export function getGroupParticipants(
  env: Bindings,
  groupId: number,
  ownerUserId: string,
) {
  return listGroupParticipants(env, groupId, ownerUserId);
}

export async function previewGroupInvitation(
  env: Bindings,
  token: string,
  now = new Date(),
) {
  const tokenHash = await hashInvitationToken(token);
  const invitation = await getGroupInvitationByTokenHash(env, tokenHash);
  if (!invitation) return null;
  if (
    invitation.status === "pending" &&
    isInvitationExpired(new Date(invitation.expires_at), now)
  ) {
    await markGroupInvitationExpired(env, invitation.id, now);
    invitation.status = "expired";
  }
  return {
    group_id: invitation.group_id,
    group_name: invitation.group_name,
    inviter_name: invitation.inviter_name,
    email_hint: maskInvitationEmail(invitation.email),
    status: invitation.status,
    expires_at: invitation.expires_at,
  };
}

export async function acceptInvitation(
  env: Bindings,
  token: string,
  userId: string,
  now = new Date(),
) {
  return acceptGroupInvitation(env, await hashInvitationToken(token), userId, now);
}

export async function declineInvitation(
  env: Bindings,
  token: string,
  userId: string,
  now = new Date(),
) {
  return declineGroupInvitation(env, await hashInvitationToken(token), userId, now);
}

/**
 * 保留中の招待のトークンを失効させ、配送タスクを積み直す。
 * 一括招待と同じ経路に載せるので、送信自体はここでは行わない。
 */
export async function resendInvitation(
  env: Bindings,
  groupId: number,
  invitationId: number,
  ownerUserId: string,
  now = new Date(),
) {
  const rotated = await rotatePendingGroupInvitation(
    env,
    groupId,
    invitationId,
    ownerUserId,
    await placeholderTokenHash(),
    invitationExpiresAt(now),
    now,
  );
  if ("notFound" in rotated || "invalidState" in rotated) return rotated;
  return { ok: true as const, delivery_status: "queued" as const };
}

export function revokeInvitation(
  env: Bindings,
  groupId: number,
  invitationId: number,
  ownerUserId: string,
  now = new Date(),
) {
  return revokePendingGroupInvitation(
    env,
    groupId,
    invitationId,
    ownerUserId,
    now,
  );
}

export function removeMember(
  env: Bindings,
  groupId: number,
  memberUserId: string,
  ownerUserId: string,
) {
  return removeGroupUserMember(env, groupId, memberUserId, ownerUserId);
}

export function leaveGroup(env: Bindings, groupId: number, userId: string) {
  return leaveGroupMembership(env, groupId, userId);
}
