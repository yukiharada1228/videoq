import {
  getCourseChatHistory,
  deleteCourseChatLogs,
  getCourseChatAnalytics,
  updateChatLogFeedback,
  shareSlugExists as repositoryShareSlugExists,
  iterateCourseChatHistoryForExport,
} from "../../repositories/chat-repository";
import { courseOwnedBy } from "../../repositories/course-repository";
import { streamChatHistoryCsv } from "../../shared/csv";
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
  if (!(await courseOwnedBy(env, courseId, userId))) {
    return { notFound: true } as const;
  }
  return {
    body: streamChatHistoryCsv(
      iterateCourseChatHistoryForExport(env, courseId, userId),
    ),
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
  const updated = await updateChatLogFeedback(env, logId, feedback, opts);
  if ("notFound" in updated) return { notFound: "Specified chat history not found" } as const;
  if ("forbidden" in updated) {
    return { forbidden: opts.shareSlug ? "Share token mismatch" : "No permission to access this history" } as const;
  }
  return {
    ok: true as const,
    chat_log_id: updated.id,
    feedback: updated.feedback,
  };
}
