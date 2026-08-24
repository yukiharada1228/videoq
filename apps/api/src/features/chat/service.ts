import {
  getCourseChatHistory,
  getCourseChatHistoryForExport,
  deleteCourseChatLogs,
  getCourseChatAnalytics,
  getFeedbackLog,
  updateChatLogFeedback,
  shareSlugExists as repositoryShareSlugExists,
} from "../../repositories/chat-repository";
import { buildChatHistoryCsv } from "../../shared/csv";
import type { Bindings } from "../../types/bindings";

export function shareSlugExists(env: Bindings, shareSlug: string) {
  return repositoryShareSlugExists(env, shareSlug);
}

export async function historyForCourse(
  env: Bindings,
  courseId: number,
  userId: string,
  limit: number,
  offset: number,
) {
  return getCourseChatHistory(env, courseId, userId, limit, offset);
}

export async function exportHistoryCsv(
  env: Bindings,
  courseId: number,
  userId: string,
) {
  const res = await getCourseChatHistoryForExport(env, courseId, userId);
  if ("notFound" in res) return { notFound: true } as const;
  return {
    csv: buildChatHistoryCsv(res.rows),
    filename: `chat_history_course_${courseId}.csv`,
  } as const;
}

export async function resetHistory(
  env: Bindings,
  courseId: number,
  userId: string,
) {
  return deleteCourseChatLogs(env, courseId, userId);
}

export async function analyticsForCourse(
  env: Bindings,
  courseId: number,
  userId: string,
) {
  return getCourseChatAnalytics(env, courseId, userId);
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
    if (log.course_share_slug !== opts.shareSlug) {
      return { forbidden: "Share token mismatch" } as const;
    }
  } else if (log.course_user_id !== opts.userId && log.log_user_id !== opts.userId) {
    return { forbidden: "No permission to access this history" } as const;
  }

  const updated = await updateChatLogFeedback(env, logId, feedback);
  return {
    ok: true as const,
    chat_log_id: updated.id,
    feedback: updated.feedback,
  };
}
