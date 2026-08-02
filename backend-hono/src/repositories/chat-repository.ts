import { withDb } from "../db/pool";
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

/**
 * `get_with_members` 相当。share_token 指定時は share_slug で、
 * それ以外は user_id で絞る（どちらも無ければ id のみ）。見つからなければ null。
 */
export async function getGroupWithMembers(
  env: Bindings,
  params: { groupId: number; userId?: number | null; shareToken?: string | null },
): Promise<GroupChatContext | null> {
  return withDb(env, async (db, client) => {
    const where = params.shareToken
      ? { sql: "id = $1 AND share_slug = $2", args: [params.groupId, params.shareToken] }
      : params.userId
        ? { sql: "id = $1 AND user_id = $2", args: [params.groupId, params.userId] }
        : { sql: "id = $1", args: [params.groupId] };

    const g = await client.query(
      `SELECT id, user_id, description FROM app_videogroup WHERE ${where.sql}`,
      where.args,
    );
    if (g.rowCount === 0) return null;

    const members = await client.query(
      `SELECT video_id FROM app_videogroupmember WHERE group_id = $1 ORDER BY "order", id`,
      [params.groupId],
    );
    const row = g.rows[0];
    return {
      id: Number(row.id),
      userId: Number(row.user_id),
      description: row.description ?? null,
      memberVideoIds: members.rows.map((m) => Number(m.video_id)),
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
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `INSERT INTO app_chatlog
         (user_id, group_id, question, answer, citations, retrieved_contexts,
          is_shared_origin, feedback, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, NULL, now())
       RETURNING id, feedback`,
      [
        params.userId,
        params.groupId,
        params.question,
        params.answer,
        JSON.stringify(params.citations ?? []),
        JSON.stringify(params.retrievedContexts ?? []),
        params.isShared,
      ],
    );
    return { id: Number(rows[0].id), feedback: rows[0].feedback ?? null };
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
  return withDb(env, async (db, client) => {
    await client.query("BEGIN");
    try {
      const owner = await client.query(
        `SELECT 1 FROM app_videogroup WHERE id = $1 AND user_id = $2`,
        [groupId, userId],
      );
      if (owner.rowCount === 0) {
        await client.query("ROLLBACK");
        return { notFound: true } as const;
      }
      await client.query(
        `DELETE FROM app_chatlogevaluation
          WHERE chat_log_id IN (SELECT id FROM app_chatlog WHERE group_id = $1)`,
        [groupId],
      );
      await client.query(`DELETE FROM app_chatlog WHERE group_id = $1`, [groupId]);
      await client.query("COMMIT");
      return { ok: true } as const;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
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
  return withDb(env, async (db, client) => {
    const owner = await client.query(
      `SELECT 1 FROM app_videogroup WHERE id = $1 AND user_id = $2`,
      [groupId, userId],
    );
    if (owner.rowCount === 0) return { notFound: true } as const;

    const { rows } = await client.query(
      `SELECT question, answer, citations::text AS citations, is_shared_origin, feedback,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS') AS ts,
              to_char(created_at AT TIME ZONE 'UTC', 'US') AS micros
         FROM app_chatlog
        WHERE group_id = $1
        ORDER BY created_at ASC`,
      [groupId],
    );

    return {
      rows: rows.map((r) => ({
        created_at:
          r.micros === "000000" ? `${r.ts}+00:00` : `${r.ts}.${r.micros}+00:00`,
        question: r.question,
        answer: r.answer,
        is_shared_origin: r.is_shared_origin,
        citations: (JSON.parse(r.citations) as Array<Record<string, unknown>>).map(
          (c, i) => ({
            id: i + 1,
            video_id: c.video_id as number,
            title: c.title as string,
            start_time: (c.start_time as string | null) ?? null,
            end_time: (c.end_time as string | null) ?? null,
          }),
        ),
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
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `SELECT cl.id, g.user_id AS group_user_id, g.share_slug AS group_share_token
         FROM app_chatlog cl
         JOIN app_videogroup g ON g.id = cl.group_id
        WHERE cl.id = $1`,
      [logId],
    );
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
  return withDb(env, async (db, client) => {
    const { rows } = await client.query(
      `UPDATE app_chatlog SET feedback = $2 WHERE id = $1 RETURNING id, feedback`,
      [logId, feedback],
    );
    const r = rows[0];
    return { id: Number(r.id), feedback: r.feedback ?? null };
  });
}

/** share_slug が何らかのグループに解決するか（ShareTokenAuthentication のゲート相当）。 */
export async function shareSlugExists(
  env: Bindings,
  shareSlug: string,
): Promise<boolean> {
  return withDb(env, async (db, client) => {
    const { rowCount } = await client.query(
      `SELECT 1 FROM app_videogroup WHERE share_slug = $1`,
      [shareSlug],
    );
    return (rowCount ?? 0) > 0;
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
  return withDb(env, async (db, client) => {
    const owner = await client.query(
      `SELECT 1 FROM app_videogroup WHERE id = $1 AND user_id = $2`,
      [groupId, userId],
    );
    if (owner.rowCount === 0) return { notFound: true } as const;

    const sum = await client.query(
      `SELECT count(*)::int AS total,
              to_char(min(created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') AS first_dt,
              to_char(max(created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') AS last_dt,
              count(*) FILTER (WHERE feedback = 'good')::int AS good,
              count(*) FILTER (WHERE feedback = 'bad')::int AS bad,
              count(*) FILTER (WHERE feedback IS NULL)::int AS none
         FROM app_chatlog WHERE group_id = $1`,
      [groupId],
    );

    const ts = await client.query(
      `SELECT (created_at AT TIME ZONE 'America/Chicago')::date::text AS date,
              count(*)::int AS count
         FROM app_chatlog WHERE group_id = $1
        GROUP BY (created_at AT TIME ZONE 'America/Chicago')::date
        ORDER BY (created_at AT TIME ZONE 'America/Chicago')::date`,
      [groupId],
    );

    const s = sum.rows[0];
    return {
      summary: {
        total_questions: s.total,
        date_range: {
          // Python datetime.isoformat（UTC aware）= "...+00:00"
          first: s.first_dt ? `${s.first_dt}+00:00` : null,
          last: s.last_dt ? `${s.last_dt}+00:00` : null,
        },
      },
      time_series: ts.rows.map((r) => ({ date: r.date, count: r.count })),
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
  return withDb(env, async (db, client) => {
    const owner = await client.query(
      `SELECT 1 FROM app_videogroup WHERE id = $1 AND user_id = $2`,
      [groupId, userId],
    );
    if (owner.rowCount === 0) return { notFound: true } as const;

    await client.query(`SET timezone = '${APP_TIMEZONE}'`);

    const countRes = await client.query(
      `SELECT count(*)::int AS c FROM app_chatlog WHERE group_id = $1`,
      [groupId],
    );

    const { rows } = await client.query(
      `SELECT id, group_id, question, answer, citations::text AS citations,
              is_shared_origin, feedback,
              to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF') AS created_at
         FROM app_chatlog
        WHERE group_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      [groupId, limit, offset],
    );

    const results: ChatLogItem[] = rows.map((r) => ({
      id: Number(r.id),
      group: Number(r.group_id),
      question: r.question,
      answer: r.answer,
      citations: (JSON.parse(r.citations) as Array<Record<string, unknown>>).map(
        (c, i) => ({
          id: i + 1, // Django は enumerate(..., start=1) の index
          video_id: c.video_id as number,
          title: c.title as string,
          start_time: (c.start_time as string | null) ?? null,
          end_time: (c.end_time as string | null) ?? null,
        }),
      ),
      is_shared_origin: r.is_shared_origin,
      feedback: r.feedback ?? null,
      created_at: normalizeDrfDatetime(r.created_at),
    }));

    return { count: countRes.rows[0].c, results };
  });
}
