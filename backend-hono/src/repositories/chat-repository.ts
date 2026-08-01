import { withClient } from "../db/pool";
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
export async function getGroupChatHistory(
  env: Bindings,
  groupId: number,
  userId: number,
  limit: number,
  offset: number,
): Promise<{ notFound: true } | { count: number; results: ChatLogItem[] }> {
  return withClient(env, async (client) => {
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
