import {
  getEvaluationSummary,
  listEvaluationLogs,
} from "../../repositories/evaluation-repository";
import type { Bindings } from "../../types/bindings";

export async function summaryForCourse(
  env: Bindings,
  courseId: number,
  userId: string,
) {
  return getEvaluationSummary(env, courseId, userId);
}

export async function logsForCourse(
  env: Bindings,
  courseId: number,
  userId: string,
  limit: number,
  offset: number,
) {
  return listEvaluationLogs(env, courseId, userId, limit, offset);
}
