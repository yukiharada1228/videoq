import { useQuery } from '@tanstack/react-query';
import { apiClient, type EvaluationSummary } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

export function useEvaluationSummary(groupId: number | null, enabled = true) {
  return useQuery<EvaluationSummary>({
    queryKey: queryKeys.chat.evaluationSummary(groupId),
    queryFn: () => apiClient.getEvaluationSummary(groupId!),
    enabled: enabled && groupId != null,
    staleTime: 5 * 60 * 1000,
  });
}
