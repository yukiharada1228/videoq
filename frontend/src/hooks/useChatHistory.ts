import { useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, type ChatHistoryItem, type ChatLogEvaluation } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

interface UseChatHistoryParams {
  groupId?: number;
  shareToken?: string;
  enabled: boolean;
}

export function useChatHistory({ groupId, shareToken, enabled }: UseChatHistoryParams) {
  const queryClient = useQueryClient();

  const historyQuery = useQuery<ChatHistoryItem[]>({
    queryKey: queryKeys.chat.history(groupId ?? null, shareToken),
    enabled: enabled && !!groupId && !shareToken,
    queryFn: async () => {
      if (!groupId || shareToken) {
        return [];
      }
      return await apiClient.getChatHistory(groupId);
    },
  });

  const evaluationsQuery = useQuery<ChatLogEvaluation[]>({
    queryKey: queryKeys.chat.evaluations(groupId ?? null),
    enabled: enabled && !!groupId && !shareToken,
    queryFn: async () => {
      if (!groupId || shareToken) {
        return [];
      }
      return await apiClient.getChatEvaluations(groupId);
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
      if (!groupId || shareToken) {
        return;
      }
      await apiClient.exportChatHistoryCsv(groupId);
    },
    onError: (e) => {
      console.error('Failed to export CSV', e);
    },
  });

  const exportHistoryCsv = useCallback(async () => {
    if (!groupId || shareToken) {
      return;
    }
    try {
      await exportHistoryCsvMutation.mutateAsync();
    } catch {
      // Handled in mutation onError.
    }
  }, [exportHistoryCsvMutation, groupId, shareToken]);

  const syncFeedbackInHistoryCache = useCallback(
    (chatLogId: number, nextFeedback: 'good' | 'bad' | null) => {
      queryClient.setQueryData<ChatHistoryItem[]>(
        queryKeys.chat.history(groupId ?? null, shareToken),
        (prev) =>
          prev
            ? prev.map((item) =>
                item.id === chatLogId ? { ...item, feedback: nextFeedback } : item,
              )
            : prev,
      );
    },
    [groupId, queryClient, shareToken],
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
