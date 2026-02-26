import { useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, type ChatHistoryItem } from '@/lib/api';
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

  useEffect(() => {
    if (enabled && historyQuery.error) {
      console.error('Failed to load history', historyQuery.error);
    }
  }, [enabled, historyQuery.error]);

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
    history: historyQuery.data ?? null,
    historyLoading: historyQuery.isLoading || historyQuery.isFetching,
    historyError: historyQuery.error,
    exportHistoryCsv,
    isExportingHistoryCsv: exportHistoryCsvMutation.isPending,
    syncFeedbackInHistoryCache,
  };
}
