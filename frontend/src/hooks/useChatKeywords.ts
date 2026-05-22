import { useQuery } from '@tanstack/react-query';
import { apiClient, type ChatAnalyticsKeywords } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

export function useChatKeywords(groupId: number | null, enabled = true) {
  return useQuery<ChatAnalyticsKeywords>({
    queryKey: queryKeys.chat.keywords(groupId!),
    queryFn: () => apiClient.getChatKeywords(groupId!),
    enabled: enabled && groupId != null,
    staleTime: 5 * 60 * 1000,
  });
}
