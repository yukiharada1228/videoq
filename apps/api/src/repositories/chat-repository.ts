import { and, asc, desc, eq, sql } from "drizzle-orm";
import { withDb } from "../db/pool";
import {
  appChatlog,
  appChatlogevaluation,
  appVideogroup,
  appVideogroupmember,
} from "../db/schema";
import { APP_TIMEZONE, normalizeDrfDatetime } from "../utils/datetime";
import type { Bindings } from "../types/bindings";

export type ChatCitation = {
  id: number;
  video_id: number;
  title: string;
  start_time: string | null;
  end_time: string | null;
};

// Django ChatLogSerializer に一致する形。
export type ChatLogItem = {
  id: number;
  group: number;
  question: string;
  answer: string;
  citations: ChatCitation[];
  is_shared_origin: boolean;
  feedback: string | null;
  created_at: string;
};

/**
 * グループのチャット履歴（所有者のみ）。
 * - 所有権: app_videogroup(id=group, user_id) が無ければ notFound（→404 "Group not found."）。
 * - 並び: created_at DESC（Meta.ordering=-created_at, get_logs_for_group）。
 * - citations: JSON 配列を {id:1始まりindex, video_id, title, start_time, end_time} へ整形。
 */
/** チャット送信時のグループ文脈（VideoGroupContextEntity 相当）。 */
export type GroupChatContext = {
  id: number;
  userId: number;
  description: string | null;
  memberVideoIds: number[];
};

const createdAtDrf = sql<string>`to_char(${appChatlog.createdAt}, 'YYYY-MM-DD"T"HH24:MI:SS.USOF')`.as(
  "created_at",
);

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

async function groupOwnedBy(
  db: Parameters<Parameters<typeof withDb>[1]>[0],
  groupId: number,
  userId: number,
): Promise<boolean> {
  const rows = await db
    .select({ id: appVideogroup.id })
    .from(appVideogroup)
    .where(and(eq(appVideogroup.id, groupId), eq(appVideogroup.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

/**
 * `get_with_members` 相当。share_token 指定時は share_slug で、
 * それ以外は user_id で絞る（どちらも無ければ id のみ）。見つからなければ null。
 */
export async function getGroupWithMembers(
  env: Bindings,
  params: { groupId: number; userId?: number | null; shareToken?: string | null },
): Promise<GroupChatContext | null> {
  return withDb(env, async (db) => {
    const conditions = [eq(appVideogroup.id, params.groupId)];
    if (params.shareToken) {
      conditions.push(eq(appVideogroup.shareSlug, params.shareToken));
    } else if (params.userId) {
      conditions.push(eq(appVideogroup.userId, params.userId));
    }

    const groups = await db
      .select({
        id: appVideogroup.id,
        userId: appVideogroup.userId,
        description: appVideogroup.description,
      })
      .from(appVideogroup)
      .where(and(...conditions))
      .limit(1);
    if (groups.length === 0) return null;

    const members = await db
      .select({ videoId: appVideogroupmember.videoId })
      .from(appVideogroupmember)
      .where(eq(appVideogroupmember.groupId, params.groupId))
      .orderBy(asc(appVideogroupmember.order), asc(appVideogroupmember.id));

    const row = groups[0];
    return {
      id: Number(row.id),
      userId: Number(row.userId),
      description: row.description ?? null,
      memberVideoIds: members.map((m) => Number(m.videoId)),
    };
  });
}

/**
 * ChatLog を作成（`create_log` 相当）。citations は id を持たない dict 配列で保存し、
 * 参照時に 1 始まりの index を振る（既存 history/feedback 実装と同じ約束）。
 */
export async function createChatLog(
  env: Bindings,
  params: {
    userId: number;
    groupId: number;
    question: string;
    answer: string;
    citations: readonly Record<string, unknown>[] | null;
    isShared: boolean;
    retrievedContexts: readonly string[];
  },
): Promise<{ id: number; feedback: string | null }> {
  return withDb(env, async (db) => {
    const rows = await db
      .insert(appChatlog)
      .values({
        userId: params.userId,
        groupId: params.groupId,
        question: params.question,
        answer: params.answer,
        citations: params.citations ?? [],
        retrievedContexts: params.retrievedContexts ?? [],
        isSharedOrigin: params.isShared,
        feedback: null,
        createdAt: sql`now()`,
      })
      .returning({ id: appChatlog.id, feedback: appChatlog.feedback });
    const r = rows[0];
    return { id: Number(r.id), feedback: r.feedback ?? null };
  });
}

/**
 * グループのチャット履歴を全削除（`delete_logs_for_group` 相当）。
 * Django の `.delete()` は ChatLogEvaluation（OneToOne, on_delete=CASCADE）も消すが、
 * DB 側に ON DELETE CASCADE は無いため、依存順にトランザクションで明示削除する。
 */
export async function deleteGroupChatLogs(
  env: Bindings,
  groupId: number,
  userId: number,
): Promise<{ notFound: true } | { ok: true }> {
  return withDb(env, async (db) =>
    db.transaction(async (tx) => {
      const owner = await tx
        .select({ id: appVideogroup.id })
        .from(appVideogroup)
        .where(and(eq(appVideogroup.id, groupId), eq(appVideogroup.userId, userId)))
        .limit(1);
      if (owner.length === 0) return { notFound: true } as const;

      await tx.execute(sql`
        DELETE FROM app_chatlogevaluation
         WHERE chat_log_id IN (SELECT id FROM app_chatlog WHERE group_id = ${groupId})
      `);
      await tx.delete(appChatlog).where(eq(appChatlog.groupId, groupId));
      return { ok: true } as const;
    }),
  );
}

/** CSV エクスポート 1 行分（ChatHistoryExportRow 相当・created_at 昇順）。 */
export type ChatHistoryExportRow = {
  created_at: string; // Python datetime.isoformat()（UTC aware）
  question: string;
  answer: string;
  is_shared_origin: boolean;
  citations: ChatCitation[];
  feedback: string | null;
};

/**
 * CSV 用の全件取得（`get_logs_for_group(ascending=True)`）。
 * created_at は DRF ではなく **モデルの datetime.isoformat()** がそのまま出るため UTC。
 * マイクロ秒 0 のときは Python が `.000000` を省略するので同じ形に整える。
 */
export async function getGroupChatHistoryForExport(
  env: Bindings,
  groupId: number,
  userId: number,
): Promise<{ notFound: true } | { rows: ChatHistoryExportRow[] }> {
  return withDb(env, async (db) => {
    if (!(await groupOwnedBy(db, groupId, userId))) {
      return { notFound: true } as const;
    }

    const result = await db.execute(sql`
      SELECT question, answer, citations::text AS citations, is_shared_origin, feedback,
             to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') AS ts,
             to_char(created_at AT TIME ZONE 'UTC', 'US') AS micros
        FROM app_chatlog
       WHERE group_id = ${groupId}
       ORDER BY created_at ASC
    `);
    const rows = result.rows as Array<{
      question: string;
      answer: string;
      citations: string;
      is_shared_origin: boolean;
      feedback: string | null;
      ts: string;
      micros: string;
    }>;

    return {
      rows: rows.map((r) => ({
        created_at:
          r.micros === "000000" ? `${r.ts}+00:00` : `${r.ts}.${r.micros}+00:00`,
        question: r.question,
        answer: r.answer,
        is_shared_origin: r.is_shared_origin,
        citations: mapCitations(r.citations),
        feedback: r.feedback ?? null,
      })),
    };
  });
}

/** feedback 用: chat log + その group の user_id / share_slug（権限判定に使う）。 */
export async function getFeedbackLog(
  env: Bindings,
  logId: number,
): Promise<
  | null
  | { id: number; group_user_id: number; group_share_token: string | null }
> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({
        id: appChatlog.id,
        group_user_id: appVideogroup.userId,
        group_share_token: appVideogroup.shareSlug,
      })
      .from(appChatlog)
      .innerJoin(appVideogroup, eq(appVideogroup.id, appChatlog.groupId))
      .where(eq(appChatlog.id, logId))
      .limit(1);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: Number(r.id),
      group_user_id: Number(r.group_user_id),
      group_share_token: r.group_share_token ?? null,
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
      .update(appChatlog)
      .set({ feedback })
      .where(eq(appChatlog.id, logId))
      .returning({ id: appChatlog.id, feedback: appChatlog.feedback });
    const r = rows[0];
    return { id: Number(r.id), feedback: r.feedback ?? null };
  });
}

/** share_slug が何らかのグループに解決するか（ShareTokenAuthentication のゲート相当）。 */
export async function shareSlugExists(
  env: Bindings,
  shareSlug: string,
): Promise<boolean> {
  return withDb(env, async (db) => {
    const rows = await db
      .select({ id: appVideogroup.id })
      .from(appVideogroup)
      .where(eq(appVideogroup.shareSlug, shareSlug))
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
 * グループのチャット分析（ChatGroupAnalyticsView）。
 * - date_range.first/last: min/max(created_at) の **UTC isoformat**（Django の datetime.isoformat, +00:00）。
 * - time_series.date: TruncDate（settings.TIME_ZONE=America/Chicago の日付境界）→ "YYYY-MM-DD"。
 * - feedback.none: feedback IS NULL の件数（'' は none に含めない）。
 * - 未所有/不在は notFound（→404 "Group not found."）。
 */
export async function getGroupChatAnalytics(
  env: Bindings,
  groupId: number,
  userId: number,
): Promise<{ notFound: true } | ChatAnalytics> {
  return withDb(env, async (db) => {
    if (!(await groupOwnedBy(db, groupId, userId))) {
      return { notFound: true } as const;
    }

    const sumResult = await db.execute(sql`
      SELECT count(*)::int AS total,
             to_char(min(created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') AS first_dt,
             to_char(max(created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') AS last_dt,
             count(*) FILTER (WHERE feedback = 'good')::int AS good,
             count(*) FILTER (WHERE feedback = 'bad')::int AS bad,
             count(*) FILTER (WHERE feedback IS NULL)::int AS none
        FROM app_chatlog WHERE group_id = ${groupId}
    `);
    const tsResult = await db.execute(sql`
      SELECT (created_at AT TIME ZONE 'America/Chicago')::date::text AS date,
             count(*)::int AS count
        FROM app_chatlog WHERE group_id = ${groupId}
       GROUP BY (created_at AT TIME ZONE 'America/Chicago')::date
       ORDER BY (created_at AT TIME ZONE 'America/Chicago')::date
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
          first: s.first_dt ? `${s.first_dt}+00:00` : null,
          last: s.last_dt ? `${s.last_dt}+00:00` : null,
        },
      },
      time_series: ts.map((r) => ({ date: r.date, count: r.count })),
      feedback: { good: s.good, bad: s.bad, none: s.none },
    };
  });
}

export async function getGroupChatHistory(
  env: Bindings,
  groupId: number,
  userId: number,
  limit: number,
  offset: number,
): Promise<{ notFound: true } | { count: number; results: ChatLogItem[] }> {
  return withDb(env, async (db) => {
    if (!(await groupOwnedBy(db, groupId, userId))) {
      return { notFound: true } as const;
    }

    await db.execute(sql.raw(`SET timezone = '${APP_TIMEZONE}'`));

    const countRes = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(appChatlog)
      .where(eq(appChatlog.groupId, groupId));

    const rows = await db
      .select({
        id: appChatlog.id,
        group_id: appChatlog.groupId,
        question: appChatlog.question,
        answer: appChatlog.answer,
        citations: sql<string>`${appChatlog.citations}::text`.as("citations"),
        is_shared_origin: appChatlog.isSharedOrigin,
        feedback: appChatlog.feedback,
        created_at: createdAtDrf,
      })
      .from(appChatlog)
      .where(eq(appChatlog.groupId, groupId))
      .orderBy(desc(appChatlog.createdAt))
      .limit(limit)
      .offset(offset);

    const results: ChatLogItem[] = rows.map((r) => ({
      id: Number(r.id),
      group: Number(r.group_id),
      question: r.question,
      answer: r.answer,
      citations: mapCitations(r.citations),
      is_shared_origin: r.is_shared_origin,
      feedback: r.feedback ?? null,
      created_at: normalizeDrfDatetime(r.created_at),
    }));

    return { count: countRes[0].c, results };
  });
}
