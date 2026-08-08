import { and, avg, count, desc, eq, sql } from "drizzle-orm";
import { withDb } from "../db/pool";
import { chatLogs, chatLogEvaluations, videoGroups } from "../db/schema";
import { toUtcIso } from "../shared/datetime";
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
 * RAGAS 集計。接続は withDb（Drizzle）を使い、API 契約に沿った結果を返す。
 */
export async function getEvaluationSummary(
  env: Bindings,
  groupId: number,
  userId: string,
): Promise<{ notFound: true } | EvaluationSummary> {
  return withDb(env, async (db) => {
    const owner = await db
      .select({ x: sql<number>`1` })
      .from(videoGroups)
      .where(and(eq(videoGroups.id, groupId), eq(videoGroups.userId, userId)))
      .limit(1);
    if (owner.length === 0) return { notFound: true } as const;

    const [r] = await db
      .select({
        evaluated_count: sql<number>`count(*)::int`,
        avg_faithfulness: avg(chatLogEvaluations.faithfulness),
        avg_answer_relevancy: avg(chatLogEvaluations.answerRelevancy),
        avg_context_precision: avg(chatLogEvaluations.contextPrecision),
      })
      .from(chatLogEvaluations)
      .innerJoin(chatLogs, eq(chatLogEvaluations.chatLogId, chatLogs.id))
      .where(and(eq(chatLogs.groupId, groupId), eq(chatLogEvaluations.status, "completed")));

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
  userId: string,
  limit: number,
  offset: number,
): Promise<{ notFound: true } | { count: number; results: EvaluationLog[] }> {
  return withDb(env, async (db) => {
    const owner = await db
      .select({ x: sql<number>`1` })
      .from(videoGroups)
      .where(and(eq(videoGroups.id, groupId), eq(videoGroups.userId, userId)))
      .limit(1);
    if (owner.length === 0) return { notFound: true } as const;

    const [cnt] = await db
      .select({ c: count() })
      .from(chatLogEvaluations)
      .innerJoin(chatLogs, eq(chatLogEvaluations.chatLogId, chatLogs.id))
      .where(eq(chatLogs.groupId, groupId));

    const rows = await db
      .select({
        chat_log_id: chatLogEvaluations.chatLogId,
        status: chatLogEvaluations.status,
        faithfulness: chatLogEvaluations.faithfulness,
        answer_relevancy: chatLogEvaluations.answerRelevancy,
        context_precision: chatLogEvaluations.contextPrecision,
        error_message: chatLogEvaluations.errorMessage,
        evaluated_at: chatLogEvaluations.evaluatedAt,
      })
      .from(chatLogEvaluations)
      .innerJoin(chatLogs, eq(chatLogEvaluations.chatLogId, chatLogs.id))
      .where(eq(chatLogs.groupId, groupId))
      .orderBy(desc(chatLogs.createdAt))
      .limit(limit)
      .offset(offset);

    const results: EvaluationLog[] = rows.map((r) => ({
      chat_log_id: Number(r.chat_log_id),
      status: r.status,
      faithfulness: numOrNull(r.faithfulness),
      answer_relevancy: numOrNull(r.answer_relevancy),
      context_precision: numOrNull(r.context_precision),
      error_message: r.error_message,
      evaluated_at: r.evaluated_at ? toUtcIso(r.evaluated_at) : null,
    }));
    return { count: Number(cnt.c), results };
  });
}
