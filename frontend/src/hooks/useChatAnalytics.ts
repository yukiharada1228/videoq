import { useQuery } from '@tanstack/react-query';
import { apiClient, type ChatAnalytics } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

export function useChatAnalytics(courseId: number | null, enabled = true) {
  return useQuery<ChatAnalytics>({
    queryKey: queryKeys.chat.analytics(courseId!),
    queryFn: () => apiClient.getChatAnalytics(courseId!),
    enabled: enabled && courseId != null,
    staleTime: 5 * 60 * 1000,
  });
}
