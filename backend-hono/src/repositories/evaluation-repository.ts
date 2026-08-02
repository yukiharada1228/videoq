import { withDb } from "../db/pool";
import { APP_TIMEZONE, normalizeDrfDatetime } from "../utils/datetime";
import type { Bindings } from "../types/bindings";

export type EvaluationSummary = {
  group_id: number;
  evaluated_count: number;
  avg_faithfulness: number | null;
  avg_answer_relevancy: number | null;
  avg_context_precision: number | null;
};

export type EvaluationLog = {
  chat_log_id: number;
  status: string;
  faithfulness: number | null;
  answer_relevancy: number | null;
  context_precision: number | null;
  error_message: string;
  evaluated_at: string | null;
};

const numOrNull = (v: unknown): number | null => (v === null ? null : Number(v));

/**
 * RAGAS 集計。接続は withDb（Drizzle）。SQL は DRF 互換契約維持。
 */
export async function getEvaluationSummary(
  env: Bindings,
  groupId: number,
  userId: number,
): Promise<{ notFound: true } | EvaluationSummary> {
  return withDb(env, async (_db, client) => {
    const owner = await client.query(
      `SELECT 1 FROM app_videogroup WHERE id = $1 AND user_id = $2`,
      [groupId, userId],
    );
    if (owner.rowCount === 0) return { notFound: true } as const;

    const { rows } = await client.query(
      `SELECT count(*)::int AS evaluated_count,
              avg(e.faithfulness)     AS avg_faithfulness,
              avg(e.answer_relevancy) AS avg_answer_relevancy,
              avg(e.context_precision) AS avg_context_precision
         FROM app_chatlogevaluation e
         JOIN app_chatlog c ON c.id = e.chat_log_id
        WHERE c.group_id = $1 AND e.status = 'completed'`,
      [groupId],
    );
    const r = rows[0];
    return {
      group_id: groupId,
      evaluated_count: r.evaluated_count,
      avg_faithfulness: numOrNull(r.avg_faithfulness),
      avg_answer_relevancy: numOrNull(r.avg_answer_relevancy),
      avg_context_precision: numOrNull(r.avg_context_precision),
    };
  });
}

export async function listEvaluationLogs(
  env: Bindings,
  groupId: number,
  userId: number,
  limit: number,
  offset: number,
): Promise<{ notFound: true } | { count: number; results: EvaluationLog[] }> {
  return withDb(env, async (_db, client) => {
    const owner = await client.query(
      `SELECT 1 FROM app_videogroup WHERE id = $1 AND user_id = $2`,
      [groupId, userId],
    );
    if (owner.rowCount === 0) return { notFound: true } as const;

    await client.query(`SET timezone = '${APP_TIMEZONE}'`);

    const cnt = await client.query(
      `SELECT count(*)::int AS c
         FROM app_chatlogevaluation e
         JOIN app_chatlog c ON c.id = e.chat_log_id
        WHERE c.group_id = $1`,
      [groupId],
    );

    const { rows } = await client.query(
      `SELECT e.chat_log_id, e.status, e.faithfulness, e.answer_relevancy,
              e.context_precision, e.error_message,
              to_char(e.evaluated_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF') AS evaluated_at
         FROM app_chatlogevaluation e
         JOIN app_chatlog c ON c.id = e.chat_log_id
        WHERE c.group_id = $1
        ORDER BY c.created_at DESC
        LIMIT $2 OFFSET $3`,
      [groupId, limit, offset],
    );

    const results: EvaluationLog[] = rows.map((r) => ({
      chat_log_id: Number(r.chat_log_id),
      status: r.status,
      faithfulness: numOrNull(r.faithfulness),
      answer_relevancy: numOrNull(r.answer_relevancy),
      context_precision: numOrNull(r.context_precision),
      error_message: r.error_message,
      evaluated_at: r.evaluated_at ? normalizeDrfDatetime(r.evaluated_at) : null,
    }));
    return { count: cnt.rows[0].c, results };
  });
}
