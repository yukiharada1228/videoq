import { useEffect, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { trpc } from '@/lib/trpc';

interface UseChatHistoryParams {
  courseId?: number;
  shareToken?: string;
  enabled: boolean;
}

export function useChatHistory({ courseId, shareToken, enabled }: UseChatHistoryParams) {
  // Both endpoints order by chat creation time and ID, newest first.
  const pageInput = { courseId: courseId!, limit: 100, offset: 0 };
  const canLoadHistory = enabled && !!courseId && !shareToken;

  const historyQuery = useQuery(trpc.chat.history.queryOptions(pageInput, {
    enabled: canLoadHistory,
  }));

  const evaluationsQuery = useQuery(trpc.evaluation.logs.queryOptions(pageInput, {
    // Optional scores must not hold up history in the same HTTP batch, and
    // there is nothing to evaluate when history is empty or failed to load.
    enabled: canLoadHistory && !!historyQuery.data?.data.length,
  }));

  useEffect(() => {
    if (enabled && historyQuery.error) {
      console.error('Failed to load history', historyQuery.error);
    }
  }, [enabled, historyQuery.error]);

  useEffect(() => {
    if (enabled && evaluationsQuery.error) {
      console.error('Failed to load chat evaluations', evaluationsQuery.error);
    }
  }, [enabled, evaluationsQuery.error]);

  const historyWithEvaluations = useMemo(() => {
    const history = historyQuery.data?.data ?? null;
    if (!history) return null;

    const evaluationsByChatLogId = new Map(
      (evaluationsQuery.data?.data ?? []).map((evaluation) => [evaluation.chat_log_id, evaluation]),
    );

    return history.map((item) => ({
      ...item,
      evaluation: evaluationsByChatLogId.get(item.id),
    }));
  }, [historyQuery.data, evaluationsQuery.data]);

  const exportHistoryCsvMutation = useMutation({
    mutationFn: async () => {
      if (!courseId || shareToken) {
        return;
      }
      await apiClient.exportChatHistoryCsv(courseId);
    },
    onError: (e) => {
      console.error('Failed to export CSV', e);
    },
  });

  return {
    history: historyWithEvaluations,
    historyLoading: historyQuery.isLoading,
    historyError: historyQuery.error,
    exportHistoryCsv: exportHistoryCsvMutation.mutate,
    isExportingHistoryCsv: exportHistoryCsvMutation.isPending,
  };
}
