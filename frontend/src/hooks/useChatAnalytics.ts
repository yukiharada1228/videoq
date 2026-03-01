import { useQuery } from '@tanstack/react-query';
import { apiClient, type ChatAnalytics } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

export function useChatAnalytics(groupId: number | null, enabled = true) {
  return useQuery<ChatAnalytics>({
    queryKey: queryKeys.chat.analytics(groupId!),
    queryFn: () => apiClient.getChatAnalytics(groupId!),
    enabled: enabled && groupId != null,
    staleTime: 5 * 60 * 1000,
  });
}
