import {
  getGroupChatHistory,
  getGroupChatHistoryForExport,
  deleteGroupChatLogs,
  getGroupChatAnalytics,
  getFeedbackLog,
  updateChatLogFeedback,
  shareSlugExists as repositoryShareSlugExists,
} from "../../repositories/chat-repository";
import { buildChatHistoryCsv } from "../../shared/csv";
import type { Bindings } from "../../types/bindings";

export function shareSlugExists(env: Bindings, shareSlug: string) {
  return repositoryShareSlugExists(env, shareSlug);
}

export async function historyForGroup(
  env: Bindings,
  groupId: number,
  userId: string,
  limit: number,
  offset: number,
) {
  return getGroupChatHistory(env, groupId, userId, limit, offset);
}

export async function exportHistoryCsv(
  env: Bindings,
  groupId: number,
  userId: string,
) {
  const res = await getGroupChatHistoryForExport(env, groupId, userId);
  if ("notFound" in res) return { notFound: true } as const;
  return {
    csv: buildChatHistoryCsv(res.rows),
    filename: `chat_history_group_${groupId}.csv`,
  } as const;
}

export async function resetHistory(
  env: Bindings,
  groupId: number,
  userId: string,
) {
  return deleteGroupChatLogs(env, groupId, userId);
}

export async function analyticsForGroup(
  env: Bindings,
  groupId: number,
  userId: string,
) {
  return getGroupChatAnalytics(env, groupId, userId);
}

export async function submitFeedback(
  env: Bindings,
  logId: number,
  feedback: "good" | "bad" | null,
  opts: { userId?: string; shareSlug?: string | null },
) {
  const log = await getFeedbackLog(env, logId);
  if (!log) return { notFound: "Specified chat history not found" } as const;

  if (opts.shareSlug) {
    if (log.group_share_token !== opts.shareSlug) {
      return { forbidden: "Share token mismatch" } as const;
    }
  } else if (log.group_user_id !== opts.userId && log.log_user_id !== opts.userId) {
    return { forbidden: "No permission to access this history" } as const;
  }

  const updated = await updateChatLogFeedback(env, logId, feedback);
  return {
    ok: true as const,
    chat_log_id: updated.id,
    feedback: updated.feedback,
  };
}
