import { and, avg, count, desc, eq, sql } from "drizzle-orm";
import { withDb } from "../db/pool";
import { appChatlog, appChatlogevaluation, appVideogroup } from "../db/schema";
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

const evaluatedAtDrf = sql<string | null>`to_char(${appChatlogevaluation.evaluatedAt}, 'YYYY-MM-DD"T"HH24:MI:SS.USOF')`.as(
  "evaluated_at",
);

/**
 * RAGAS 集計。接続は withDb（Drizzle）。SQL は DRF 互換契約維持。
 */
export async function getEvaluationSummary(
  env: Bindings,
  groupId: number,
  userId: number,
): Promise<{ notFound: true } | EvaluationSummary> {
  return withDb(env, async (db) => {
    const owner = await db
      .select({ x: sql<number>`1` })
      .from(appVideogroup)
      .where(and(eq(appVideogroup.id, groupId), eq(appVideogroup.userId, userId)))
      .limit(1);
    if (owner.length === 0) return { notFound: true } as const;

    const [r] = await db
      .select({
        evaluated_count: sql<number>`count(*)::int`,
        avg_faithfulness: avg(appChatlogevaluation.faithfulness),
        avg_answer_relevancy: avg(appChatlogevaluation.answerRelevancy),
        avg_context_precision: avg(appChatlogevaluation.contextPrecision),
      })
      .from(appChatlogevaluation)
      .innerJoin(appChatlog, eq(appChatlogevaluation.chatLogId, appChatlog.id))
      .where(and(eq(appChatlog.groupId, groupId), eq(appChatlogevaluation.status, "completed")));

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
  return withDb(env, async (db) => {
    const owner = await db
      .select({ x: sql<number>`1` })
      .from(appVideogroup)
      .where(and(eq(appVideogroup.id, groupId), eq(appVideogroup.userId, userId)))
      .limit(1);
    if (owner.length === 0) return { notFound: true } as const;

    await db.execute(sql.raw(`SET timezone = '${APP_TIMEZONE}'`));

    const [cnt] = await db
      .select({ c: count() })
      .from(appChatlogevaluation)
      .innerJoin(appChatlog, eq(appChatlogevaluation.chatLogId, appChatlog.id))
      .where(eq(appChatlog.groupId, groupId));

    const rows = await db
      .select({
        chat_log_id: appChatlogevaluation.chatLogId,
        status: appChatlogevaluation.status,
        faithfulness: appChatlogevaluation.faithfulness,
        answer_relevancy: appChatlogevaluation.answerRelevancy,
        context_precision: appChatlogevaluation.contextPrecision,
        error_message: appChatlogevaluation.errorMessage,
        evaluated_at: evaluatedAtDrf,
      })
      .from(appChatlogevaluation)
      .innerJoin(appChatlog, eq(appChatlogevaluation.chatLogId, appChatlog.id))
      .where(eq(appChatlog.groupId, groupId))
      .orderBy(desc(appChatlog.createdAt))
      .limit(limit)
      .offset(offset);

    const results: EvaluationLog[] = rows.map((r) => ({
      chat_log_id: Number(r.chat_log_id),
      status: r.status,
      faithfulness: numOrNull(r.faithfulness),
      answer_relevancy: numOrNull(r.answer_relevancy),
      context_precision: numOrNull(r.context_precision),
      error_message: r.error_message,
      evaluated_at: r.evaluated_at ? normalizeDrfDatetime(r.evaluated_at) : null,
    }));
    return { count: Number(cnt.c), results };
  });
}
