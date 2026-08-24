import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import { withDb } from "../db/pool";
import {
  chatLogs,
  chatLogEvaluations,
  users,
  videoCourses,
  videoCourseMembers,
  videoCourseMemberships,
} from "../db/schema";
import { toUtcIso } from "../shared/datetime";
import type { Bindings } from "../types/bindings";
import { insertJobTask } from "./external-task-repository";
import {
  buildJobMessage,
  JOB_EVALUATE_CHAT_LOG,
} from "../lib/job-message";

export type ChatCitation = {
  id: number;
  video_id: number;
  title: string;
  start_time: string | null;
  end_time: string | null;
};

export type ChatQuestionAuthor = {
  user_id: string;
  username: string;
  email: string;
};

// ChatLog API のレスポンス表現。
export type ChatLogItem = {
  id: number;
  course: number;
  asked_by: ChatQuestionAuthor | null;
  question: string;
  answer: string;
  citations: ChatCitation[];
  is_shared_origin: boolean;
  feedback: string | null;
  created_at: string;
};

/**
 * 講座のチャット履歴（所有者のみ）。
 * - 所有権: video_courses(id=course, user_id) が無ければ notFound（→404 "Course not found."）。
 * - 並び: created_at DESC（Meta.ordering=-created_at, get_logs_for_course）。
 * - citations: JSON 配列を {id:1始まりindex, video_id, title, start_time, end_time} へ整形。
 */
/** チャット送信時の講座文脈。 */
export type GroupChatContext = {
  id: number;
  userId: string;
  description: string | null;
  memberVideoIds: number[];
};


function mapCitations(raw: unknown): ChatCitation[] {
  const arr = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? (JSON.parse(raw) as Array<Record<string, unknown>>)
      : [];
  return arr.map((c, i) => ({
    id: i + 1,
    video_id: c.video_id as number,
    title: c.title as string,
    start_time: (c.start_time as string | null) ?? null,
    end_time: (c.end_time as string | null) ?? null,
  }));
}

function mapQuestionAuthor(
  isSharedOrigin: boolean,
  userId: unknown,
  username: unknown,
  email: unknown,
): ChatQuestionAuthor | null {
  if (
    isSharedOrigin
    || typeof userId !== "string"
    || typeof username !== "string"
    || typeof email !== "string"
  ) {
    return null;
  }
  return { user_id: userId, username, email };
}

async function courseOwnedBy(
  db: Parameters<Parameters<typeof withDb>[1]>[0],
  courseId: number,
  userId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: videoCourses.id })
    .from(videoCourses)
    .where(and(eq(videoCourses.id, courseId), eq(videoCourses.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

/**
 * share_token 指定時は share_slug で、
 * それ以外は user_id で絞る（どちらも無ければ id のみ）。見つからなければ null。
 */
export async function getCourseWithMembers(
  env: Bindings,
  params: { courseId: number; userId?: string | null; shareToken?: string | null },
): Promise<GroupChatContext | null> {
  return withDb(env, async (db) => {
    const conditions = [eq(videoCourses.id, params.courseId)];
    if (params.shareToken) {
      conditions.push(eq(videoCourses.shareSlug, params.shareToken));
    } else if (params.userId) {
      conditions.push(
        or(
          eq(videoCourses.userId, params.userId),
          sql`EXISTS (
            SELECT 1 FROM ${videoCourseMemberships}
             WHERE ${videoCourseMemberships.courseId} = ${videoCourses.id}
               AND ${videoCourseMemberships.userId} = ${params.userId}
          )`,
        )!,
      );
    }

    const courses = await db
      .select({
        id: videoCourses.id,
        userId: videoCourses.userId,
        description: videoCourses.description,
      })
      .from(videoCourses)
      .where(and(...conditions))
      .limit(1);
    if (courses.length === 0) return null;

    const members = await db
      .select({ videoId: videoCourseMembers.videoId })
      .from(videoCourseMembers)
      .where(eq(videoCourseMembers.courseId, params.courseId))
      .orderBy(asc(videoCourseMembers.order), asc(videoCourseMembers.id));

    const row = courses[0];
    return {
      id: Number(row.id),
      userId: String(row.userId),
      description: row.description ?? null,
      memberVideoIds: members.map((m) => Number(m.videoId)),
    };
  });
}

/**
 * ChatLog を作成する。citations は id を持たないオブジェクト配列で保存し、
 * 参照時に 1 始まりの index を振る（既存 history/feedback 実装と同じ約束）。
 */
export async function createChatLog(
  env: Bindings,
  params: {
    userId: string;
    courseId: number;
    question: string;
    answer: string;
    citations: readonly Record<string, unknown>[] | null;
    isShared: boolean;
    retrievedContexts: readonly string[];
  },
): Promise<{ id: number; feedback: string | null; taskId: number }> {
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      const rows = await tx
        .insert(chatLogs)
        .values({
          userId: params.userId,
          courseId: params.courseId,
          question: params.question,
          answer: params.answer,
          citations: params.citations ?? [],
          retrievedContexts: params.retrievedContexts ?? [],
          isSharedOrigin: params.isShared,
          feedback: null,
          createdAt: sql`now()`,
        })
        .returning({ id: chatLogs.id, feedback: chatLogs.feedback });
      const r = rows[0];
      const chatLogId = Number(r.id);
      const message = buildJobMessage(JOB_EVALUATE_CHAT_LOG, {
        chat_log_id: chatLogId,
      });
      const task = await insertJobTask(tx, {
        message,
        dedupeKey: `chat-evaluation:${chatLogId}`,
      });
      return {
        id: chatLogId,
        feedback: r.feedback ?? null,
        taskId: task.id,
      };
    }),
  );
}

/**
 * 講座のチャット履歴を全削除する。
 * ChatLogEvaluation は関連する ChatLog より先に削除する。
 * DB 側に ON DELETE CASCADE は無いため、依存順にトランザクションで明示削除する。
 */
export async function deleteCourseChatLogs(
  env: Bindings,
  courseId: number,
  userId: string,
): Promise<{ notFound: true } | { ok: true }> {
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      const owner = await tx
        .select({ id: videoCourses.id })
        .from(videoCourses)
        .where(and(eq(videoCourses.id, courseId), eq(videoCourses.userId, userId)))
        .limit(1);
      if (owner.length === 0) return { notFound: true } as const;

      await tx.execute(sql`
        DELETE FROM chat_log_evaluations
         WHERE chat_log_id IN (SELECT id FROM chat_logs WHERE course_id = ${courseId})
      `);
      await tx.delete(chatLogs).where(eq(chatLogs.courseId, courseId));
      return { ok: true } as const;
    }),
  );
}

/** CSV エクスポート 1 行分（created_at 昇順）。 */
export type ChatHistoryExportRow = {
  created_at: string; // UTC ISO 8601
  asked_by: ChatQuestionAuthor | null;
  question: string;
  answer: string;
  is_shared_origin: boolean;
  citations: ChatCitation[];
  feedback: string | null;
};

/**
 * CSV 用にチャット履歴を昇順で全件取得する。
 * created_at は DB の日時を UTC ISO 8601 形式で返す。
 * マイクロ秒 0 のときは小数秒を省略する。
 */
export async function getCourseChatHistoryForExport(
  env: Bindings,
  courseId: number,
  userId: string,
): Promise<{ notFound: true } | { rows: ChatHistoryExportRow[] }> {
  return withDb(env, async (db) => {
    if (!(await courseOwnedBy(db, courseId, userId))) {
      return { notFound: true } as const;
    }

    const result = await db.execute(sql`
      SELECT cl.user_id, u.username, u.email,
             cl.question, cl.answer, cl.citations::text AS citations,
             cl.is_shared_origin, cl.feedback, cl.created_at
        FROM chat_logs cl
        LEFT JOIN users u ON u.id = cl.user_id
       WHERE cl.course_id = ${courseId}
       ORDER BY cl.created_at ASC
    `);
    const rows = result.rows as Array<{
      question: string;
      answer: string;
      citations: string;
      is_shared_origin: boolean;
      feedback: string | null;
      created_at: string;
      user_id: string;
      username: string | null;
      email: string | null;
    }>;

    return {
      rows: rows.map((r) => ({
        created_at: toUtcIso(r.created_at)!,
        asked_by: mapQuestionAuthor(
          r.is_shared_origin,
          r.user_id,
          r.username,
          r.email,
        ),
        question: r.question,
        answer: r.answer,
        is_shared_origin: r.is_shared_origin,
        citations: mapCitations(r.citations),
        feedback: r.feedback ?? null,
      })),
    };
  });
}

/** feedback 用: chat log + その course の user_id / share_slug（権限判定に使う）。 */
export async function getFeedbackLog(
  env: Bindings,
  logId: number,
): Promise<
  | null
  | {
      id: number;
      log_user_id: string;
      course_user_id: string;
      course_share_slug: string | null;
    }
> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({
        id: chatLogs.id,
        log_user_id: chatLogs.userId,
        course_user_id: videoCourses.userId,
        course_share_slug: videoCourses.shareSlug,
      })
      .from(chatLogs)
      .innerJoin(videoCourses, eq(videoCourses.id, chatLogs.courseId))
      .where(eq(chatLogs.id, logId))
      .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: Number(r.id),
      log_user_id: String(r.log_user_id),
      course_user_id: String(r.course_user_id),
      course_share_slug: r.course_share_slug ?? null,
    };
  });
}

/** feedback を更新して {id, feedback} を返す（feedback は good/bad/null）。 */
export async function updateChatLogFeedback(
  env: Bindings,
  logId: number,
  feedback: string | null,
): Promise<{ id: number; feedback: string | null }> {
  return withDb(env, async (db) => {
    const rows = await db
      .update(chatLogs)
      .set({ feedback })
      .where(eq(chatLogs.id, logId))
      .returning({ id: chatLogs.id, feedback: chatLogs.feedback });
    const r = rows[0];
    return { id: Number(r.id), feedback: r.feedback ?? null };
  });
}

/** share_slug が何らかの講座に解決するか判定する。 */
export async function shareSlugExists(
  env: Bindings,
  shareSlug: string,
): Promise<boolean> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ id: videoCourses.id })
      .from(videoCourses)
      .where(eq(videoCourses.shareSlug, shareSlug))
      .limit(1);
    return rows.length > 0;
  });
}

export type ChatAnalytics = {
  summary: {
    total_questions: number;
    date_range: { first: string | null; last: string | null };
  };
  time_series: { date: string; count: number }[];
  feedback: { good: number; bad: number; none: number };
};

/**
 * 講座のチャット分析（ChatGroupAnalyticsView）。
 * - date_range.first/last: min/max(created_at) の UTC ISO 8601（+00:00）。
 * - time_series.date: UTC 日付境界 → "YYYY-MM-DD"。
 * - feedback.none: feedback IS NULL の件数（'' は none に含めない）。
 * - 未所有/不在は notFound（→404 "Course not found."）。
 */
export async function getCourseChatAnalytics(
  env: Bindings,
  courseId: number,
  userId: string,
): Promise<{ notFound: true } | ChatAnalytics> {
  return withDb(env, async (db) => {
    if (!(await courseOwnedBy(db, courseId, userId))) {
      return { notFound: true } as const;
    }

    const sumResult = await db.execute(sql`
      SELECT count(*)::int AS total,
             min(created_at) AS first_dt,
             max(created_at) AS last_dt,
             count(*) FILTER (WHERE feedback = 'good')::int AS good,
             count(*) FILTER (WHERE feedback = 'bad')::int AS bad,
             count(*) FILTER (WHERE feedback IS NULL)::int AS none
        FROM chat_logs WHERE course_id = ${courseId}
    `);
    const tsResult = await db.execute(sql`
      SELECT (created_at AT TIME ZONE 'UTC')::date::text AS date,
             count(*)::int AS count
        FROM chat_logs WHERE course_id = ${courseId}
       GROUP BY (created_at AT TIME ZONE 'UTC')::date
       ORDER BY (created_at AT TIME ZONE 'UTC')::date
    `);

    const s = sumResult.rows[0] as {
      total: number;
      first_dt: string | null;
      last_dt: string | null;
      good: number;
      bad: number;
      none: number;
    };
    const ts = tsResult.rows as Array<{ date: string; count: number }>;

    return {
      summary: {
        total_questions: s.total,
        date_range: {
          first: s.first_dt == null ? null : toUtcIso(s.first_dt),
          last: s.last_dt == null ? null : toUtcIso(s.last_dt),
        },
      },
      time_series: ts.map((r) => ({ date: r.date, count: r.count })),
      feedback: { good: s.good, bad: s.bad, none: s.none },
    };
  });
}

export async function getCourseChatHistory(
  env: Bindings,
  courseId: number,
  userId: string,
  limit: number,
  offset: number,
): Promise<{ notFound: true } | { count: number; results: ChatLogItem[] }> {
  return withDb(env, async (db) => {
    if (!(await courseOwnedBy(db, courseId, userId))) {
      return { notFound: true } as const;
    }

    const countRes = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(chatLogs)
      .where(eq(chatLogs.courseId, courseId));

    const rows = await db
      .select({
        id: chatLogs.id,
        course_id: chatLogs.courseId,
        user_id: chatLogs.userId,
        username: users.username,
        email: users.email,
        question: chatLogs.question,
        answer: chatLogs.answer,
        citations: sql<string>`${chatLogs.citations}::text`.as("citations"),
        is_shared_origin: chatLogs.isSharedOrigin,
        feedback: chatLogs.feedback,
        created_at: chatLogs.createdAt,
      })
      .from(chatLogs)
      .leftJoin(users, eq(users.id, chatLogs.userId))
      .where(eq(chatLogs.courseId, courseId))
      .orderBy(desc(chatLogs.createdAt))
      .limit(limit)
      .offset(offset);

    const results: ChatLogItem[] = rows.map((r) => ({
      id: Number(r.id),
      course: Number(r.course_id),
      asked_by: mapQuestionAuthor(
        r.is_shared_origin,
        r.user_id,
        r.username,
        r.email,
      ),
      question: r.question,
      answer: r.answer,
      citations: mapCitations(r.citations),
      is_shared_origin: r.is_shared_origin,
      feedback: r.feedback ?? null,
      created_at: toUtcIso(r.created_at)!,
    }));

    return { count: countRes[0].c, results };
  });
}
