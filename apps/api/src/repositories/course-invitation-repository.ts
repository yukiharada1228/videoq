import { and, desc, eq, inArray, lt, lte, sql } from "drizzle-orm";
import { type Db, withDb } from "../db/pool";
import {
  externalTasks,
  users,
  videoCourseInvitations,
  videoCourseMemberships,
  videoCourses,
} from "../db/schema";
import {
  effectiveInvitationStatus,
  isInvitationExpired,
  normalizeInvitationEmail,
  type InvitationDeliveryStatus,
  type InvitationStatus,
} from "../lib/course-invitations";
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
  courseName: string;
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

export async function createPendingCourseInvitations(
  env: Bindings,
  courseId: number,
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
          courseName: videoCourses.name,
          ownerEmail: users.email,
          inviterName: users.name,
          inviterUsername: users.username,
        })
        .from(videoCourses)
        .innerJoin(users, eq(users.id, videoCourses.userId))
        .where(and(eq(videoCourses.id, courseId), eq(videoCourses.userId, ownerUserId)))
        .limit(1)
        .for("update");
      if (ownerRows.length === 0) return { notFound: true } as const;

      const issuedAt = inputs[0]?.createdAt ?? new Date();
      await tx
        .update(videoCourseInvitations)
        .set({ status: "expired", updatedAt: issuedAt.toISOString() })
        .where(
          and(
            eq(videoCourseInvitations.courseId, courseId),
            eq(videoCourseInvitations.status, "pending"),
            lte(videoCourseInvitations.expiresAt, issuedAt.toISOString()),
          ),
        );

      const emails = inputs.map((input) => input.email);
      const alreadyMemberEmails = new Set<string>();
      const ownerEmail = normalizeInvitationEmail(ownerRows[0].ownerEmail);
      if (ownerEmail && emails.includes(ownerEmail)) alreadyMemberEmails.add(ownerEmail);

      if (emails.length > 0) {
        const memberRows = await tx
          .select({ email: users.email })
          .from(videoCourseMemberships)
          .innerJoin(users, eq(users.id, videoCourseMemberships.userId))
          .where(
            and(
              eq(videoCourseMemberships.courseId, courseId),
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
          .select({ email: videoCourseInvitations.email })
          .from(videoCourseInvitations)
          .where(
            and(
              eq(videoCourseInvitations.courseId, courseId),
              eq(videoCourseInvitations.status, "pending"),
              inArray(
                videoCourseInvitations.email,
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
            .insert(videoCourseInvitations)
            .values(
              insertInputs.map((input) => ({
                courseId,
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
            .returning({ id: videoCourseInvitations.id, email: videoCourseInvitations.email })
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
          courseName: ownerRows[0].courseName,
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

/**
 * 配信結果を記録する。`completeTaskId` を渡すと、配送タスクの完了も同じ
 * transaction で行う（`withDb` は呼び出しごとに新しい接続を張るため、
 * 記録と完了を分けると1通あたりの接続が1回増える）。
 */
export async function recordInvitationDeliveryOutcomes(
  env: Bindings,
  outcomes: readonly InvitationDeliveryOutcome[],
  opts: { completeTaskId?: number } = {},
): Promise<void> {
  if (outcomes.length === 0 && opts.completeTaskId === undefined) return;
  await withDb(env, async (db) =>
    db.transaction(async (tx) => {
      for (const outcome of outcomes) {
        await tx
          .update(videoCourseInvitations)
          .set({
            deliveryStatus: outcome.status,
            lastSentAt:
              outcome.status === "sent" ? outcome.attemptedAt.toISOString() : undefined,
            lastError: outcome.error?.slice(0, 1000) ?? null,
            sendAttempts: sql`${videoCourseInvitations.sendAttempts} + 1`,
            updatedAt: outcome.attemptedAt.toISOString(),
          })
          .where(eq(videoCourseInvitations.id, outcome.invitationId));
      }
      if (opts.completeTaskId !== undefined) {
        await tx
          .update(externalTasks)
          .set({
            completedAt: sql`now()`,
            lockedAt: null,
            lastError: "",
            updatedAt: sql`now()`,
          })
          .where(
            and(
              eq(externalTasks.id, opts.completeTaskId),
              sql`${externalTasks.completedAt} IS NULL`,
            ),
          );
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
      .update(videoCourseInvitations)
      .set({
        deliveryStatus: "failed",
        lastError: "Delivery task is no longer retrying.",
        updatedAt: now.toISOString(),
      })
      .where(
        and(
          eq(videoCourseInvitations.status, "pending"),
          eq(videoCourseInvitations.deliveryStatus, "queued"),
          lt(videoCourseInvitations.updatedAt, cutoff),
          sql`NOT EXISTS (
            SELECT 1
              FROM external_tasks t
             WHERE t.kind = 'invitation_email'
               AND t.completed_at IS NULL
               AND t.dead_at IS NULL
               AND (t.payload->>'invitation_id')::bigint = ${videoCourseInvitations.id}
          )`,
        ),
      )
      .returning({ id: videoCourseInvitations.id });
    return { failed: rows.length };
  });
}

export type CourseInvitationListItem = {
  id: number;
  email: string;
  status: InvitationStatus;
  delivery_status: InvitationDeliveryStatus;
  expires_at: string;
  created_at: string;
  last_sent_at: string | null;
  send_attempts: number;
};

export type CourseUserMemberListItem = {
  user_id: string;
  username: string;
  email: string;
  joined_at: string;
};

export async function listCourseParticipants(
  env: Bindings,
  courseId: number,
  ownerUserId: string,
): Promise<
  | { notFound: true }
  | { invitations: CourseInvitationListItem[]; members: CourseUserMemberListItem[] }
> {
  return withDb(env, async (db) => {
    const owner = await db
      .select({ id: videoCourses.id })
      .from(videoCourses)
      .where(and(eq(videoCourses.id, courseId), eq(videoCourses.userId, ownerUserId)))
      .limit(1);
    if (owner.length === 0) return { notFound: true } as const;

    const now = new Date().toISOString();
    await db
      .update(videoCourseInvitations)
      .set({ status: "expired", updatedAt: now })
      .where(
        and(
          eq(videoCourseInvitations.courseId, courseId),
          eq(videoCourseInvitations.status, "pending"),
          lte(videoCourseInvitations.expiresAt, now),
        ),
      );

    const [invitationRows, memberRows] = await Promise.all([
      db
        .select({
          id: videoCourseInvitations.id,
          email: videoCourseInvitations.email,
          status: videoCourseInvitations.status,
          deliveryStatus: videoCourseInvitations.deliveryStatus,
          expiresAt: videoCourseInvitations.expiresAt,
          createdAt: videoCourseInvitations.createdAt,
          lastSentAt: videoCourseInvitations.lastSentAt,
          sendAttempts: videoCourseInvitations.sendAttempts,
        })
        .from(videoCourseInvitations)
        .where(eq(videoCourseInvitations.courseId, courseId))
        .orderBy(desc(videoCourseInvitations.createdAt)),
      db
        .select({
          userId: users.id,
          username: users.username,
          email: users.email,
          joinedAt: videoCourseMemberships.joinedAt,
        })
        .from(videoCourseMemberships)
        .innerJoin(users, eq(users.id, videoCourseMemberships.userId))
        .where(eq(videoCourseMemberships.courseId, courseId))
        .orderBy(desc(videoCourseMemberships.joinedAt)),
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
  course_id: number;
  course_name: string;
  inviter_name: string;
  email: string;
  status: InvitationStatus;
  expires_at: string;
};

export async function getCourseInvitationByTokenHash(
  env: Bindings,
  tokenHash: string,
): Promise<InvitationPreviewRecord | null> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({
        id: videoCourseInvitations.id,
        courseId: videoCourses.id,
        courseName: videoCourses.name,
        inviterName: users.name,
        inviterUsername: users.username,
        email: videoCourseInvitations.email,
        status: videoCourseInvitations.status,
        expiresAt: videoCourseInvitations.expiresAt,
      })
      .from(videoCourseInvitations)
      .innerJoin(videoCourses, eq(videoCourses.id, videoCourseInvitations.courseId))
      .innerJoin(users, eq(users.id, videoCourseInvitations.invitedByUserId))
      .where(eq(videoCourseInvitations.tokenHash, tokenHash))
      .limit(1);
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      id: Number(row.id),
      course_id: Number(row.courseId),
      course_name: row.courseName,
      inviter_name: row.inviterName.trim() || row.inviterUsername,
      email: row.email,
      status: row.status as InvitationStatus,
      expires_at: toUtcIso(row.expiresAt)!,
    };
  });
}

export async function markCourseInvitationExpired(
  env: Bindings,
  invitationId: number,
  now: Date,
): Promise<void> {
  await withDb(env, async (db) => {
    await db
      .update(videoCourseInvitations)
      .set({ status: "expired", updatedAt: now.toISOString() })
      .where(
        and(
          eq(videoCourseInvitations.id, invitationId),
          eq(videoCourseInvitations.status, "pending"),
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
  | { ok: true; courseId: number };

export async function acceptCourseInvitation(
  env: Bindings,
  tokenHash: string,
  userId: string,
  now: Date,
): Promise<InvitationDecisionResult> {
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      const invitationRows = await tx
        .select({
          id: videoCourseInvitations.id,
          courseId: videoCourseInvitations.courseId,
          email: videoCourseInvitations.email,
          status: videoCourseInvitations.status,
          expiresAt: videoCourseInvitations.expiresAt,
          acceptedByUserId: videoCourseInvitations.acceptedByUserId,
        })
        .from(videoCourseInvitations)
        .where(eq(videoCourseInvitations.tokenHash, tokenHash))
        .limit(1)
        .for("update");
      if (invitationRows.length === 0) return { notFound: true } as const;

      const invitation = invitationRows[0];
      if (
        invitation.status === "accepted" &&
        invitation.acceptedByUserId === userId
      ) {
        return { ok: true, courseId: Number(invitation.courseId) } as const;
      }
      if (invitation.status !== "pending") {
        return { invalidState: invitation.status as InvitationStatus } as const;
      }
      if (isInvitationExpired(new Date(invitation.expiresAt), now)) {
        await tx
          .update(videoCourseInvitations)
          .set({ status: "expired", updatedAt: now.toISOString() })
          .where(eq(videoCourseInvitations.id, invitation.id));
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
        .insert(videoCourseMemberships)
        .values({
          courseId: Number(invitation.courseId),
          userId,
          invitationId: Number(invitation.id),
          joinedAt: now.toISOString(),
        })
        .onConflictDoNothing();
      await tx
        .update(videoCourseInvitations)
        .set({
          status: "accepted",
          acceptedByUserId: userId,
          acceptedAt: now.toISOString(),
          updatedAt: now.toISOString(),
        })
        .where(eq(videoCourseInvitations.id, invitation.id));
      return { ok: true, courseId: Number(invitation.courseId) } as const;
    }),
  );
}

export async function declineCourseInvitation(
  env: Bindings,
  tokenHash: string,
  userId: string,
  now: Date,
): Promise<InvitationDecisionResult> {
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      const invitationRows = await tx
        .select({
          id: videoCourseInvitations.id,
          courseId: videoCourseInvitations.courseId,
          email: videoCourseInvitations.email,
          status: videoCourseInvitations.status,
          expiresAt: videoCourseInvitations.expiresAt,
        })
        .from(videoCourseInvitations)
        .where(eq(videoCourseInvitations.tokenHash, tokenHash))
        .limit(1)
        .for("update");
      if (invitationRows.length === 0) return { notFound: true } as const;
      const invitation = invitationRows[0];
      if (invitation.status !== "pending") {
        return { invalidState: invitation.status as InvitationStatus } as const;
      }
      if (isInvitationExpired(new Date(invitation.expiresAt), now)) {
        await tx
          .update(videoCourseInvitations)
          .set({ status: "expired", updatedAt: now.toISOString() })
          .where(eq(videoCourseInvitations.id, invitation.id));
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
        .update(videoCourseInvitations)
        .set({ status: "declined", updatedAt: now.toISOString() })
        .where(eq(videoCourseInvitations.id, invitation.id));
      return { ok: true, courseId: Number(invitation.courseId) } as const;
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
  | { email: string; courseName: string; inviterName: string }
> {
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: videoCourseInvitations.id,
          email: videoCourseInvitations.email,
          status: videoCourseInvitations.status,
          expiresAt: videoCourseInvitations.expiresAt,
          courseName: videoCourses.name,
          inviterName: users.name,
          inviterUsername: users.username,
        })
        .from(videoCourseInvitations)
        .innerJoin(videoCourses, eq(videoCourses.id, videoCourseInvitations.courseId))
        .innerJoin(users, eq(users.id, videoCourseInvitations.invitedByUserId))
        .where(eq(videoCourseInvitations.id, invitationId))
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
            .update(videoCourseInvitations)
            .set({ status: "expired", updatedAt: now.toISOString() })
            .where(eq(videoCourseInvitations.id, invitationId));
        }
        return { invalidState: status } as const;
      }

      await tx
        .update(videoCourseInvitations)
        .set({ tokenHash, updatedAt: now.toISOString() })
        .where(eq(videoCourseInvitations.id, invitationId));
      return {
        email: rows[0].email,
        courseName: rows[0].courseName,
        inviterName: rows[0].inviterName.trim() || rows[0].inviterUsername,
      };
    }),
  );
}

export async function rotatePendingCourseInvitation(
  env: Bindings,
  courseId: number,
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
          id: videoCourseInvitations.id,
          email: videoCourseInvitations.email,
          status: videoCourseInvitations.status,
          expiresAt: videoCourseInvitations.expiresAt,
          courseName: videoCourses.name,
          inviterName: users.name,
          inviterUsername: users.username,
        })
        .from(videoCourseInvitations)
        .innerJoin(videoCourses, eq(videoCourses.id, videoCourseInvitations.courseId))
        .innerJoin(users, eq(users.id, videoCourses.userId))
        .where(
          and(
            eq(videoCourseInvitations.id, invitationId),
            eq(videoCourseInvitations.courseId, courseId),
            eq(videoCourses.userId, ownerUserId),
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
            .update(videoCourseInvitations)
            .set({ status: "expired", updatedAt: now.toISOString() })
            .where(eq(videoCourseInvitations.id, invitationId));
        }
        return { invalidState: status } as const;
      }
      // tokenHash は「誰も持っていないダミー」。古いリンクをここで即座に
      // 無効化し、実際に配る値は配送タスクが送信直前に発行する。
      await tx
        .update(videoCourseInvitations)
        .set({
          tokenHash,
          expiresAt: expiresAt.toISOString(),
          deliveryStatus: "queued",
          lastError: null,
          updatedAt: now.toISOString(),
        })
        .where(eq(videoCourseInvitations.id, invitationId));
      await insertInvitationEmailTasks(tx, [invitationId], now);
      return {
        id: Number(rows[0].id),
        email: rows[0].email,
        courseName: rows[0].courseName,
        inviterName: rows[0].inviterName.trim() || rows[0].inviterUsername,
      };
    }),
  );
}

export async function revokePendingCourseInvitation(
  env: Bindings,
  courseId: number,
  invitationId: number,
  ownerUserId: string,
  now: Date,
): Promise<{ notFound: true } | { invalidState: InvitationStatus } | { ok: true }> {
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      const rows = await tx
        .select({
          status: videoCourseInvitations.status,
          expiresAt: videoCourseInvitations.expiresAt,
        })
        .from(videoCourseInvitations)
        .innerJoin(videoCourses, eq(videoCourses.id, videoCourseInvitations.courseId))
        .where(
          and(
            eq(videoCourseInvitations.id, invitationId),
            eq(videoCourseInvitations.courseId, courseId),
            eq(videoCourses.userId, ownerUserId),
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
            .update(videoCourseInvitations)
            .set({ status: "expired", updatedAt: now.toISOString() })
            .where(eq(videoCourseInvitations.id, invitationId));
        }
        return { invalidState: status } as const;
      }
      await tx
        .update(videoCourseInvitations)
        .set({ status: "revoked", updatedAt: now.toISOString() })
        .where(eq(videoCourseInvitations.id, invitationId));
      return { ok: true } as const;
    }),
  );
}

export async function removeCourseUserMember(
  env: Bindings,
  courseId: number,
  memberUserId: string,
  ownerUserId: string,
): Promise<{ notFound: true } | { ok: true }> {
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      const owner = await tx
        .select({ id: videoCourses.id })
        .from(videoCourses)
        .where(and(eq(videoCourses.id, courseId), eq(videoCourses.userId, ownerUserId)))
        .limit(1);
      if (owner.length === 0) return { notFound: true } as const;
      const removed = await tx
        .delete(videoCourseMemberships)
        .where(
          and(
            eq(videoCourseMemberships.courseId, courseId),
            eq(videoCourseMemberships.userId, memberUserId),
          ),
        )
        .returning({ id: videoCourseMemberships.id });
      if (removed.length === 0) return { notFound: true } as const;
      return { ok: true } as const;
    }),
  );
}

export async function leaveCourseMembership(
  env: Bindings,
  courseId: number,
  userId: string,
): Promise<{ notFound: true } | { ok: true }> {
  return withDb(env, async (db) => {
    const removed = await db
      .delete(videoCourseMemberships)
      .where(
        and(
          eq(videoCourseMemberships.courseId, courseId),
          eq(videoCourseMemberships.userId, userId),
        ),
      )
      .returning({ id: videoCourseMemberships.id });
    return removed.length > 0 ? ({ ok: true } as const) : ({ notFound: true } as const);
  });
}

export async function userHasCourseAccess(
  env: Bindings,
  courseId: number,
  userId: string,
): Promise<boolean> {
  return withDb(env, async (db) => {
    const rows = await db.execute(sql`
      SELECT 1
        FROM video_courses g
       WHERE g.id = ${courseId}
         AND (
           g.user_id = ${userId}
           OR EXISTS (
             SELECT 1 FROM video_course_memberships gm
              WHERE gm.course_id = g.id AND gm.user_id = ${userId}
           )
         )
       LIMIT 1
    `);
    return rows.rows.length > 0;
  });
}
