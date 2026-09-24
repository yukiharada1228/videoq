import { and, avg, count, desc, eq, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { type Db, withDb } from "../db/pool";
import { chatLogs, chatLogEvaluations, videoCourses } from "../db/schema";
import { toUtcIso } from "../shared/datetime";
import type { Bindings } from "../types/bindings";

type EvaluationStatus = "pending" | "completed" | "failed";

export type EvaluationSummary = {
  course_id: number;
  evaluated_count: number;
  avg_faithfulness: number | null;
  avg_answer_relevancy: number | null;
  avg_context_precision: number | null;
};

export type EvaluationLog = {
  chat_log_id: number;
  status: EvaluationStatus;
  faithfulness: number | null;
  answer_relevancy: number | null;
  context_precision: number | null;
  error_message: string;
  evaluated_at: string | null;
};

const numOrNull = (v: unknown): number | null => (v === null ? null : Number(v));

function evaluationStatus(value: string): EvaluationStatus {
  if (value === "pending" || value === "completed" || value === "failed") return value;
  throw new Error(`Invalid evaluation status in database: ${value}`);
}

// Older workers may have stored non-finite RAGAS scores. Normalize before
// aggregation so valid scores still contribute to averages, and reuse for logs.
function finiteMetric(column: AnyPgColumn) {
  return sql<number | null>`CASE
    WHEN ${column} IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8) THEN NULL
    ELSE ${column}
  END`.as(column.name);
}

// Keep unevaluated chats out of the LEFT JOIN used for ownership-aware counts.
function evaluationsForCourse(db: Db, courseId: number) {
  return db
    .select({
      chatLogId: chatLogEvaluations.chatLogId,
      status: chatLogEvaluations.status,
      faithfulness: finiteMetric(chatLogEvaluations.faithfulness),
      answerRelevancy: finiteMetric(chatLogEvaluations.answerRelevancy),
      contextPrecision: finiteMetric(chatLogEvaluations.contextPrecision),
      errorMessage: chatLogEvaluations.errorMessage,
      evaluatedAt: chatLogEvaluations.evaluatedAt,
      chatCreatedAt: chatLogs.createdAt,
    })
    .from(chatLogEvaluations)
    .innerJoin(chatLogs, eq(chatLogEvaluations.chatLogId, chatLogs.id))
    .where(eq(chatLogs.courseId, courseId))
    .as("course_evaluations");
}

/**
 * RAGAS 集計。接続は withDb（Drizzle）を使い、API 契約に沿った結果を返す。
 */
export async function getEvaluationSummary(
  env: Bindings,
  courseId: number,
  userId: string,
): Promise<{ notFound: true } | EvaluationSummary> {
  return withDb(env, async (db) => {
    const evaluations = evaluationsForCourse(db, courseId);
    const [r] = await db
      .select({
        evaluated_count: count(evaluations.chatLogId),
        avg_faithfulness: avg(evaluations.faithfulness),
        avg_answer_relevancy: avg(evaluations.answerRelevancy),
        avg_context_precision: avg(evaluations.contextPrecision),
      })
      .from(videoCourses)
      .leftJoin(evaluations, eq(evaluations.status, "completed"))
      .where(and(eq(videoCourses.id, courseId), eq(videoCourses.userId, userId)))
      .groupBy(videoCourses.id);
    if (!r) return { notFound: true } as const;

    return {
      course_id: courseId,
      evaluated_count: r.evaluated_count,
      avg_faithfulness: numOrNull(r.avg_faithfulness),
      avg_answer_relevancy: numOrNull(r.avg_answer_relevancy),
      avg_context_precision: numOrNull(r.avg_context_precision),
    };
  });
}

export async function listEvaluationLogs(
  env: Bindings,
  courseId: number,
  userId: string,
  limit: number,
  offset: number,
): Promise<{ notFound: true } | { count: number; results: EvaluationLog[] }> {
  return withDb(env, async (db) => {
    const evaluations = evaluationsForCourse(db, courseId);
    const [total] = await db
      .select({ count: count(evaluations.chatLogId) })
      .from(videoCourses)
      .leftJoin(evaluations, sql`true`)
      .where(and(eq(videoCourses.id, courseId), eq(videoCourses.userId, userId)))
      .groupBy(videoCourses.id);
    if (!total) return { notFound: true } as const;
    if (offset >= total.count) return { count: total.count, results: [] };

    const rows = await db
      .select({
        chat_log_id: evaluations.chatLogId,
        status: evaluations.status,
        faithfulness: evaluations.faithfulness,
        answer_relevancy: evaluations.answerRelevancy,
        context_precision: evaluations.contextPrecision,
        error_message: evaluations.errorMessage,
        evaluated_at: evaluations.evaluatedAt,
      })
      .from(evaluations)
      .orderBy(desc(evaluations.chatCreatedAt), desc(evaluations.chatLogId))
      .limit(limit)
      .offset(offset);

    const results: EvaluationLog[] = rows.map((r) => ({
      chat_log_id: Number(r.chat_log_id),
      status: evaluationStatus(r.status),
      faithfulness: numOrNull(r.faithfulness),
      answer_relevancy: numOrNull(r.answer_relevancy),
      context_precision: numOrNull(r.context_precision),
      error_message: r.error_message,
      evaluated_at: r.evaluated_at ? toUtcIso(r.evaluated_at) : null,
    }));
    return { count: total.count, results };
  });
}
