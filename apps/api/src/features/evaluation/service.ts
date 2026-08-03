import {
  getEvaluationSummary,
  listEvaluationLogs,
} from "../../repositories/evaluation-repository";
import type { Bindings } from "../../types/bindings";

export async function summaryForGroup(
  env: Bindings,
  groupId: number,
  userId: number,
) {
  return getEvaluationSummary(env, groupId, userId);
}

export async function logsForGroup(
  env: Bindings,
  groupId: number,
  userId: number,
  limit: number,
  offset: number,
) {
  return listEvaluationLogs(env, groupId, userId, limit, offset);
}
