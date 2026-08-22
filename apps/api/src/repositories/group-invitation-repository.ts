import { and, desc, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { type Db, withDb } from "../db/pool";
import {
  externalTasks,
  users,
  videoGroupInvitations,
  videoGroupMemberships,
  videoGroups,
} from "../db/schema";
import {
  effectiveInvitationStatus,
  isInvitationExpired,
  normalizeInvitationEmail,
  type InvitationDeliveryStatus,
  type InvitationStatus,
} from "../lib/group-invitations";
import { toUtcIso } from "../shared/datetime";
import type { Bindings } from "../types/bindings";

export type PendingInvitationInput = {
  email: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
};

export type CreatedInvitation = {
  id: number;
  email: string;
  groupName: string;
  inviterName: string;
};

/**
 * 招待メール配送タスクの dedupe key。再送のたびに新しいタスクを作れるよう
 * 招待 ID だけでなく enqueue 時刻も含める。
 */
export function invitationEmailDedupeKey(
  invitationId: number,
  enqueuedAt: Date,
): string {
  return `invitation_email:${invitationId}:${enqueuedAt.getTime()}`;
}

/** 呼び出し元のtransactionに配送タスクを載せるoutbox primitive。 */
async function insertInvitationEmailTasks(
  tx: Pick<Db, "insert">,
  invitationIds: readonly number[],
  enqueuedAt: Date,
): Promise<void> {
  if (invitationIds.length === 0) return;
  await tx
    .insert(externalTasks)
    .values(
      invitationIds.map((invitationId) => ({
        kind: "invitation_email",
        payload: { invitation_id: invitationId },
        dedupeKey: invitationEmailDedupeKey(invitationId, enqueuedAt),
      })),
    )
    .onConflictDoNothing();
}

export async function createPendingGroupInvitations(
  env: Bindings,
  groupId: number,
  ownerUserId: string,
  inputs: readonly PendingInvitationInput[],
): Promise<
  | { notFound: true }
  | {
      created: CreatedInvitation[];
      alreadyMemberEmails: string[];
      alreadyPendingEmails: string[];
    }
> {
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      const ownerRows = await tx
        .select({
          groupName: videoGroups.name,
          ownerEmail: users.email,
          inviterName: users.name,
          inviterUsername: users.username,
        })
        .from(videoGroups)
        .innerJoin(users, eq(users.id, videoGroups.userId))
        .where(and(eq(videoGroups.id, groupId), eq(videoGroups.userId, ownerUserId)))
        .limit(1)
        .for("update");
      if (ownerRows.length === 0) return { notFound: true } as const;

      const issuedAt = inputs[0]?.createdAt ?? new Date();
      await tx
        .update(videoGroupInvitations)
        .set({ status: "expired", updatedAt: issuedAt.toISOString() })
        .where(
          and(
            eq(videoGroupInvitations.groupId, groupId),
            eq(videoGroupInvitations.status, "pending"),
            lte(videoGroupInvitations.expiresAt, issuedAt.toISOString()),
          ),
        );

      const emails = inputs.map((input) => input.email);
      const alreadyMemberEmails = new Set<string>();
      const ownerEmail = normalizeInvitationEmail(ownerRows[0].ownerEmail);
      if (ownerEmail && emails.includes(ownerEmail)) alreadyMemberEmails.add(ownerEmail);

      if (emails.length > 0) {
        const memberRows = await tx
          .select({ email: users.email })
          .from(videoGroupMemberships)
          .innerJoin(users, eq(users.id, videoGroupMemberships.userId))
          .where(
            and(
              eq(videoGroupMemberships.groupId, groupId),
              inArray(sql<string>`lower(${users.email})`, emails),
            ),
          );
        for (const row of memberRows) {
          const email = normalizeInvitationEmail(row.email);
          if (email) alreadyMemberEmails.add(email);
        }
      }

      const candidateInputs = inputs.filter(
        (input) => !alreadyMemberEmails.has(input.email),
      );
      const alreadyPendingEmails = new Set<string>();
      if (candidateInputs.length > 0) {
        const pendingRows = await tx
          .select({ email: videoGroupInvitations.email })
          .from(videoGroupInvitations)
          .where(
            and(
              eq(videoGroupInvitations.groupId, groupId),
              eq(videoGroupInvitations.status, "pending"),
              inArray(
                videoGroupInvitations.email,
                candidateInputs.map((input) => input.email),
              ),
            ),
          );
        for (const row of pendingRows) alreadyPendingEmails.add(row.email);
      }

      const insertInputs = candidateInputs.filter(
        (input) => !alreadyPendingEmails.has(input.email),
      );
      const inserted = insertInputs.length
        ? await tx
            .insert(videoGroupInvitations)
            .values(
              insertInputs.map((input) => ({
                groupId,
                email: input.email,
                invitedByUserId: ownerUserId,
                status: "pending",
                deliveryStatus: "queued",
                tokenHash: input.tokenHash,
                expiresAt: input.expiresAt.toISOString(),
                createdAt: input.createdAt.toISOString(),
                updatedAt: input.createdAt.toISOString(),
                sendAttempts: 0,
              })),
            )
            .onConflictDoNothing()
            .returning({ id: videoGroupInvitations.id, email: videoGroupInvitations.email })
        : [];

      const insertedEmails = new Set(inserted.map((row) => row.email));
      for (const input of insertInputs) {
        if (!insertedEmails.has(input.email)) alreadyPendingEmails.add(input.email);
      }

      // 招待行と配送タスクを同じtransactionでコミットする（outbox）。
      // 招待だけ残ってメールが永久に送られない状態を作らない。
      await insertInvitationEmailTasks(
        tx,
        inserted.map((row) => Number(row.id)),
        issuedAt,
      );

      const inviterName =
        ownerRows[0].inviterName.trim() || ownerRows[0].inviterUsername;
      return {
        created: inserted.map((row) => ({
          id: Number(row.id),
          email: row.email,
          groupName: ownerRows[0].groupName,
          inviterName,
        })),
        alreadyMemberEmails: [...alreadyMemberEmails],
        alreadyPendingEmails: [...alreadyPendingEmails],
      };
    }),
  );
}

export type InvitationDeliveryOutcome = {
  invitationId: number;
  status: Exclude<InvitationDeliveryStatus, "queued">;
  attemptedAt: Date;
  error?: string;
};

export async function recordInvitationDeliveryOutcomes(
  env: Bindings,
  outcomes: readonly InvitationDeliveryOutcome[],
): Promise<void> {
  if (outcomes.length === 0) return;
  await withDb(env, async (db) =>
    db.transaction(async (tx) => {
      for (const outcome of outcomes) {
        await tx
          .update(videoGroupInvitations)
          .set({
            deliveryStatus: outcome.status,
            lastSentAt:
              outcome.status === "sent" ? outcome.attemptedAt.toISOString() : undefined,
            lastError: outcome.error?.slice(0, 1000) ?? null,
            sendAttempts: sql`${videoGroupInvitations.sendAttempts} + 1`,
            updatedAt: outcome.attemptedAt.toISOString(),
          })
          .where(eq(videoGroupInvitations.id, outcome.invitationId));
      }
    }),
  );
}

/**
 * 配送タスクが尽きた（dead になった / そもそも存在しない）招待を `failed` にする。
 *
 * 再試行中のタスクが残っている招待には触らない。触ってしまうと、オーナーが
 * 「失敗」表示を見て再送 → 生きているタスクと二重にトークンを回転させ、
 * 届いたメールのリンクが片方死ぬ、という競合が起きる。
 */
export async function failInvitationsWithoutLiveDelivery(
  env: Bindings,
  now: Date,
  graceMs: number,
): Promise<{ failed: number }> {
  const cutoff = new Date(now.getTime() - graceMs).toISOString();
  return withDb(env, async (db) => {
    const rows = await db
      .update(videoGroupInvitations)
      .set({
        deliveryStatus: "failed",
        lastError: "Delivery task is no longer retrying.",
        updatedAt: now.toISOString(),
      })
      .where(
        and(
          eq(videoGroupInvitations.status, "pending"),
          eq(videoGroupInvitations.deliveryStatus, "queued"),
          lt(videoGroupInvitations.updatedAt, cutoff),
          sql`NOT EXISTS (
            SELECT 1
              FROM external_tasks t
             WHERE t.kind = 'invitation_email'
               AND t.completed_at IS NULL
               AND t.dead_at IS NULL
               AND (t.payload->>'invitation_id')::bigint = ${videoGroupInvitations.id}
          )`,
        ),
      )
      .returning({ id: videoGroupInvitations.id });
    return { failed: rows.length };
  });
}

export type GroupInvitationListItem = {
  id: number;
  email: string;
  status: InvitationStatus;
  delivery_status: InvitationDeliveryStatus;
  expires_at: string;
  created_at: string;
  last_sent_at: string | null;
  send_attempts: number;
};

export type GroupUserMemberListItem = {
  user_id: string;
  username: string;
  email: string;
  joined_at: string;
};

export async function listGroupParticipants(
  env: Bindings,
  groupId: number,
  ownerUserId: string,
): Promise<
  | { notFound: true }
  | { invitations: GroupInvitationListItem[]; members: GroupUserMemberListItem[] }
> {
  return withDb(env, async (db) => {
    const owner = await db
      .select({ id: videoGroups.id })
      .from(videoGroups)
      .where(and(eq(videoGroups.id, groupId), eq(videoGroups.userId, ownerUserId)))
      .limit(1);
    if (owner.length === 0) return { notFound: true } as const;

    const now = new Date().toISOString();
    await db
      .update(videoGroupInvitations)
      .set({ status: "expired", updatedAt: now })
      .where(
        and(
          eq(videoGroupInvitations.groupId, groupId),
          eq(videoGroupInvitations.status, "pending"),
          lte(videoGroupInvitations.expiresAt, now),
        ),
      );

    const [invitationRows, memberRows] = await Promise.all([
      db
        .select({
          id: videoGroupInvitations.id,
          email: videoGroupInvitations.email,
          status: videoGroupInvitations.status,
          deliveryStatus: videoGroupInvitations.deliveryStatus,
          expiresAt: videoGroupInvitations.expiresAt,
          createdAt: videoGroupInvitations.createdAt,
          lastSentAt: videoGroupInvitations.lastSentAt,
          sendAttempts: videoGroupInvitations.sendAttempts,
        })
        .from(videoGroupInvitations)
        .where(eq(videoGroupInvitations.groupId, groupId))
        .orderBy(desc(videoGroupInvitations.createdAt)),
      db
        .select({
          userId: users.id,
          username: users.username,
          email: users.email,
          joinedAt: videoGroupMemberships.joinedAt,
        })
        .from(videoGroupMemberships)
        .innerJoin(users, eq(users.id, videoGroupMemberships.userId))
        .where(eq(videoGroupMemberships.groupId, groupId))
        .orderBy(desc(videoGroupMemberships.joinedAt)),
    ]);

    return {
      invitations: invitationRows.map((row) => ({
        id: Number(row.id),
        email: row.email,
        status: row.status as InvitationStatus,
        delivery_status: row.deliveryStatus as InvitationDeliveryStatus,
        expires_at: toUtcIso(row.expiresAt)!,
        created_at: toUtcIso(row.createdAt)!,
        last_sent_at: row.lastSentAt ? toUtcIso(row.lastSentAt) : null,
        send_attempts: row.sendAttempts,
      })),
      members: memberRows.map((row) => ({
        user_id: row.userId,
        username: row.username,
        email: row.email,
        joined_at: toUtcIso(row.joinedAt)!,
      })),
    };
  });
}

export type InvitationPreviewRecord = {
  id: number;
  group_id: number;
  group_name: string;
  inviter_name: string;
  email: string;
  status: InvitationStatus;
  expires_at: string;
};

export async function getGroupInvitationByTokenHash(
  env: Bindings,
  tokenHash: string,
): Promise<InvitationPreviewRecord | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({
        id: videoGroupInvitations.id,
        groupId: videoGroups.id,
        groupName: videoGroups.name,
        inviterName: users.name,
        inviterUsername: users.username,
        email: videoGroupInvitations.email,
        status: videoGroupInvitations.status,
        expiresAt: videoGroupInvitations.expiresAt,
      })
      .from(videoGroupInvitations)
      .innerJoin(videoGroups, eq(videoGroups.id, videoGroupInvitations.groupId))
      .innerJoin(users, eq(users.id, videoGroupInvitations.invitedByUserId))
      .where(eq(videoGroupInvitations.tokenHash, tokenHash))
      .limit(1);
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: Number(row.id),
      group_id: Number(row.groupId),
      group_name: row.groupName,
      inviter_name: row.inviterName.trim() || row.inviterUsername,
      email: row.email,
      status: row.status as InvitationStatus,
      expires_at: toUtcIso(row.expiresAt)!,
    };
  });
}

export async function markGroupInvitationExpired(
  env: Bindings,
  invitationId: number,
  now: Date,
): Promise<void> {
  await withDb(env, async (db) => {
    await db
      .update(videoGroupInvitations)
      .set({ status: "expired", updatedAt: now.toISOString() })
      .where(
        and(
          eq(videoGroupInvitations.id, invitationId),
          eq(videoGroupInvitations.status, "pending"),
        ),
      );
  });
}

type InvitationDecisionResult =
  | { notFound: true }
  | { emailUnverified: true }
  | { emailMismatch: true }
  | { invalidState: InvitationStatus }
  | { expired: true }
  | { ok: true; groupId: number };

export async function acceptGroupInvitation(
  env: Bindings,
  tokenHash: string,
  userId: string,
  now: Date,
): Promise<InvitationDecisionResult> {
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      const invitationRows = await tx
        .select({
          id: videoGroupInvitations.id,
          groupId: videoGroupInvitations.groupId,
          email: videoGroupInvitations.email,
          status: videoGroupInvitations.status,
          expiresAt: videoGroupInvitations.expiresAt,
          acceptedByUserId: videoGroupInvitations.acceptedByUserId,
        })
        .from(videoGroupInvitations)
        .where(eq(videoGroupInvitations.tokenHash, tokenHash))
        .limit(1)
        .for("update");
      if (invitationRows.length === 0) return { notFound: true } as const;

      const invitation = invitationRows[0];
      if (
        invitation.status === "accepted" &&
        invitation.acceptedByUserId === userId
      ) {
        return { ok: true, groupId: Number(invitation.groupId) } as const;
      }
      if (invitation.status !== "pending") {
        return { invalidState: invitation.status as InvitationStatus } as const;
      }
      if (isInvitationExpired(new Date(invitation.expiresAt), now)) {
        await tx
          .update(videoGroupInvitations)
          .set({ status: "expired", updatedAt: now.toISOString() })
          .where(eq(videoGroupInvitations.id, invitation.id));
        return { expired: true } as const;
      }

      const userRows = await tx
        .select({ email: users.email, emailVerified: users.emailVerified })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (userRows.length === 0 || !userRows[0].emailVerified) {
        return { emailUnverified: true } as const;
      }
      if (normalizeInvitationEmail(userRows[0].email) !== invitation.email) {
        return { emailMismatch: true } as const;
      }

      await tx
        .insert(videoGroupMemberships)
        .values({
          groupId: Number(invitation.groupId),
          userId,
          invitationId: Number(invitation.id),
          joinedAt: now.toISOString(),
        })
        .onConflictDoNothing();
      await tx
        .update(videoGroupInvitations)
        .set({
          status: "accepted",
          acceptedByUserId: userId,
          acceptedAt: now.toISOString(),
          updatedAt: now.toISOString(),
        })
        .where(eq(videoGroupInvitations.id, invitation.id));
      return { ok: true, groupId: Number(invitation.groupId) } as const;
    }),
  );
}

export async function declineGroupInvitation(
  env: Bindings,
  tokenHash: string,
  userId: string,
  now: Date,
): Promise<InvitationDecisionResult> {
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      const invitationRows = await tx
        .select({
          id: videoGroupInvitations.id,
          groupId: videoGroupInvitations.groupId,
          email: videoGroupInvitations.email,
          status: videoGroupInvitations.status,
          expiresAt: videoGroupInvitations.expiresAt,
        })
        .from(videoGroupInvitations)
        .where(eq(videoGroupInvitations.tokenHash, tokenHash))
        .limit(1)
        .for("update");
      if (invitationRows.length === 0) return { notFound: true } as const;
      const invitation = invitationRows[0];
      if (invitation.status !== "pending") {
        return { invalidState: invitation.status as InvitationStatus } as const;
      }
      if (isInvitationExpired(new Date(invitation.expiresAt), now)) {
        await tx
          .update(videoGroupInvitations)
          .set({ status: "expired", updatedAt: now.toISOString() })
          .where(eq(videoGroupInvitations.id, invitation.id));
        return { expired: true } as const;
      }
      const userRows = await tx
        .select({ email: users.email, emailVerified: users.emailVerified })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (userRows.length === 0 || !userRows[0].emailVerified) {
        return { emailUnverified: true } as const;
      }
      if (normalizeInvitationEmail(userRows[0].email) !== invitation.email) {
        return { emailMismatch: true } as const;
      }
      await tx
        .update(videoGroupInvitations)
        .set({ status: "declined", updatedAt: now.toISOString() })
        .where(eq(videoGroupInvitations.id, invitation.id));
      return { ok: true, groupId: Number(invitation.groupId) } as const;
    }),
  );
}

/**
 * 送信直前にトークンを差し替える。`pending` の招待だけが対象で、
 * enqueue から配送までの間に取り消し・承認された招待にはメールを送らない。
 * 有効期限は作成時のままにする（再試行で寿命が伸びないように）。
 */
export async function rotateInvitationTokenForDelivery(
  env: Bindings,
  invitationId: number,
  tokenHash: string,
  now: Date,
): Promise<
  | { notFound: true }
  | { invalidState: InvitationStatus }
  | { email: string; groupName: string; inviterName: string }
> {
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: videoGroupInvitations.id,
          email: videoGroupInvitations.email,
          status: videoGroupInvitations.status,
          expiresAt: videoGroupInvitations.expiresAt,
          groupName: videoGroups.name,
          inviterName: users.name,
          inviterUsername: users.username,
        })
        .from(videoGroupInvitations)
        .innerJoin(videoGroups, eq(videoGroups.id, videoGroupInvitations.groupId))
        .innerJoin(users, eq(users.id, videoGroupInvitations.invitedByUserId))
        .where(eq(videoGroupInvitations.id, invitationId))
        .limit(1)
        .for("update");
      if (rows.length === 0) return { notFound: true } as const;

      const status = effectiveInvitationStatus(
        rows[0].status as InvitationStatus,
        new Date(rows[0].expiresAt),
        now,
      );
      if (status !== "pending") {
        if (status === "expired" && rows[0].status === "pending") {
          await tx
            .update(videoGroupInvitations)
            .set({ status: "expired", updatedAt: now.toISOString() })
            .where(eq(videoGroupInvitations.id, invitationId));
        }
        return { invalidState: status } as const;
      }

      await tx
        .update(videoGroupInvitations)
        .set({ tokenHash, updatedAt: now.toISOString() })
        .where(eq(videoGroupInvitations.id, invitationId));
      return {
        email: rows[0].email,
        groupName: rows[0].groupName,
        inviterName: rows[0].inviterName.trim() || rows[0].inviterUsername,
      };
    }),
  );
}

export async function rotatePendingGroupInvitation(
  env: Bindings,
  groupId: number,
  invitationId: number,
  ownerUserId: string,
  tokenHash: string,
  expiresAt: Date,
  now: Date,
): Promise<
  | { notFound: true }
  | { invalidState: InvitationStatus }
  | CreatedInvitation
> {
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: videoGroupInvitations.id,
          email: videoGroupInvitations.email,
          status: videoGroupInvitations.status,
          expiresAt: videoGroupInvitations.expiresAt,
          groupName: videoGroups.name,
          inviterName: users.name,
          inviterUsername: users.username,
        })
        .from(videoGroupInvitations)
        .innerJoin(videoGroups, eq(videoGroups.id, videoGroupInvitations.groupId))
        .innerJoin(users, eq(users.id, videoGroups.userId))
        .where(
          and(
            eq(videoGroupInvitations.id, invitationId),
            eq(videoGroupInvitations.groupId, groupId),
            eq(videoGroups.userId, ownerUserId),
          ),
        )
        .limit(1)
        .for("update");
      if (rows.length === 0) return { notFound: true } as const;
      const status = effectiveInvitationStatus(
        rows[0].status as InvitationStatus,
        new Date(rows[0].expiresAt),
        now,
      );
      if (status !== "pending") {
        if (status === "expired" && rows[0].status === "pending") {
          await tx
            .update(videoGroupInvitations)
            .set({ status: "expired", updatedAt: now.toISOString() })
            .where(eq(videoGroupInvitations.id, invitationId));
        }
        return { invalidState: status } as const;
      }
      // tokenHash は「誰も持っていないダミー」。古いリンクをここで即座に
      // 無効化し、実際に配る値は配送タスクが送信直前に発行する。
      await tx
        .update(videoGroupInvitations)
        .set({
          tokenHash,
          expiresAt: expiresAt.toISOString(),
          deliveryStatus: "queued",
          lastError: null,
          updatedAt: now.toISOString(),
        })
        .where(eq(videoGroupInvitations.id, invitationId));
      await insertInvitationEmailTasks(tx, [invitationId], now);
      return {
        id: Number(rows[0].id),
        email: rows[0].email,
        groupName: rows[0].groupName,
        inviterName: rows[0].inviterName.trim() || rows[0].inviterUsername,
      };
    }),
  );
}

export async function revokePendingGroupInvitation(
  env: Bindings,
  groupId: number,
  invitationId: number,
  ownerUserId: string,
  now: Date,
): Promise<{ notFound: true } | { invalidState: InvitationStatus } | { ok: true }> {
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      const rows = await tx
        .select({
          status: videoGroupInvitations.status,
          expiresAt: videoGroupInvitations.expiresAt,
        })
        .from(videoGroupInvitations)
        .innerJoin(videoGroups, eq(videoGroups.id, videoGroupInvitations.groupId))
        .where(
          and(
            eq(videoGroupInvitations.id, invitationId),
            eq(videoGroupInvitations.groupId, groupId),
            eq(videoGroups.userId, ownerUserId),
          ),
        )
        .limit(1)
        .for("update");
      if (rows.length === 0) return { notFound: true } as const;
      const status = effectiveInvitationStatus(
        rows[0].status as InvitationStatus,
        new Date(rows[0].expiresAt),
        now,
      );
      if (status !== "pending") {
        if (status === "expired" && rows[0].status === "pending") {
          await tx
            .update(videoGroupInvitations)
            .set({ status: "expired", updatedAt: now.toISOString() })
            .where(eq(videoGroupInvitations.id, invitationId));
        }
        return { invalidState: status } as const;
      }
      await tx
        .update(videoGroupInvitations)
        .set({ status: "revoked", updatedAt: now.toISOString() })
        .where(eq(videoGroupInvitations.id, invitationId));
      return { ok: true } as const;
    }),
  );
}

export async function removeGroupUserMember(
  env: Bindings,
  groupId: number,
  memberUserId: string,
  ownerUserId: string,
): Promise<{ notFound: true } | { ok: true }> {
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      const owner = await tx
        .select({ id: videoGroups.id })
        .from(videoGroups)
        .where(and(eq(videoGroups.id, groupId), eq(videoGroups.userId, ownerUserId)))
        .limit(1);
      if (owner.length === 0) return { notFound: true } as const;
      const removed = await tx
        .delete(videoGroupMemberships)
        .where(
          and(
            eq(videoGroupMemberships.groupId, groupId),
            eq(videoGroupMemberships.userId, memberUserId),
          ),
        )
        .returning({ id: videoGroupMemberships.id });
      if (removed.length === 0) return { notFound: true } as const;
      return { ok: true } as const;
    }),
  );
}

export async function leaveGroupMembership(
  env: Bindings,
  groupId: number,
  userId: string,
): Promise<{ notFound: true } | { ok: true }> {
  return withDb(env, async (db) => {
    const removed = await db
      .delete(videoGroupMemberships)
      .where(
        and(
          eq(videoGroupMemberships.groupId, groupId),
          eq(videoGroupMemberships.userId, userId),
        ),
      )
      .returning({ id: videoGroupMemberships.id });
    return removed.length > 0 ? ({ ok: true } as const) : ({ notFound: true } as const);
  });
}

export async function userHasGroupAccess(
  env: Bindings,
  groupId: number,
  userId: string,
): Promise<boolean> {
  return withDb(env, async (db) => {
    const rows = await db.execute(sql`
      SELECT 1
        FROM video_groups g
       WHERE g.id = ${groupId}
         AND (
           g.user_id = ${userId}
           OR EXISTS (
             SELECT 1 FROM video_group_memberships gm
              WHERE gm.group_id = g.id AND gm.user_id = ${userId}
           )
         )
       LIMIT 1
    `);
    return rows.rows.length > 0;
  });
}
