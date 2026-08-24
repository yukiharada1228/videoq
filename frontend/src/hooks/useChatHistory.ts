import { useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, type ChatHistoryItem, type ChatLogEvaluation } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

interface UseChatHistoryParams {
  courseId?: number;
  shareToken?: string;
  enabled: boolean;
}

export function useChatHistory({ courseId, shareToken, enabled }: UseChatHistoryParams) {
  const queryClient = useQueryClient();

  const historyQuery = useQuery<ChatHistoryItem[]>({
    queryKey: queryKeys.chat.history(courseId ?? null, shareToken),
    enabled: enabled && !!courseId && !shareToken,
    queryFn: async () => {
      if (!courseId || shareToken) {
        return [];
      }
      return await apiClient.getChatHistory(courseId);
    },
  });

  const evaluationsQuery = useQuery<ChatLogEvaluation[]>({
    queryKey: queryKeys.chat.evaluations(courseId ?? null),
    enabled: enabled && !!courseId && !shareToken,
    queryFn: async () => {
      if (!courseId || shareToken) {
        return [];
      }
      return await apiClient.getChatEvaluations(courseId);
    },
  });

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

  const historyWithEvaluations = (() => {
    const history = historyQuery.data ?? null;
    if (!history) return null;

    const evaluationsByChatLogId = new Map(
      (evaluationsQuery.data ?? []).map((evaluation) => [evaluation.chat_log_id, evaluation]),
    );

    return history.map((item) => ({
      ...item,
      evaluation: evaluationsByChatLogId.get(item.id),
    }));
  })();

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

  const exportHistoryCsv = useCallback(async () => {
    if (!courseId || shareToken) {
      return;
    }
    try {
      await exportHistoryCsvMutation.mutateAsync();
    } catch {
      // Handled in mutation onError.
    }
  }, [exportHistoryCsvMutation, courseId, shareToken]);

  const syncFeedbackInHistoryCache = useCallback(
    (chatLogId: number, nextFeedback: 'good' | 'bad' | null) => {
      queryClient.setQueryData<ChatHistoryItem[]>(
        queryKeys.chat.history(courseId ?? null, shareToken),
        (prev) =>
          prev
            ? prev.map((item) =>
                item.id === chatLogId ? { ...item, feedback: nextFeedback } : item,
              )
            : prev,
      );
    },
    [courseId, queryClient, shareToken],
  );

  return {
    history: historyWithEvaluations,
    historyLoading:
      historyQuery.isLoading ||
      historyQuery.isFetching ||
      evaluationsQuery.isLoading ||
      evaluationsQuery.isFetching,
    historyError: historyQuery.error,
    exportHistoryCsv,
    isExportingHistoryCsv: exportHistoryCsvMutation.isPending,
    syncFeedbackInHistoryCache,
  };
}
