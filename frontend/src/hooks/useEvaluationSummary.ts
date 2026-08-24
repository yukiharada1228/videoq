import { useQuery } from '@tanstack/react-query';
import { apiClient, type EvaluationSummary } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

export function useEvaluationSummary(courseId: number | null, enabled = true) {
  return useQuery<EvaluationSummary>({
    queryKey: queryKeys.chat.evaluationSummary(courseId),
    queryFn: () => apiClient.getEvaluationSummary(courseId!),
    enabled: enabled && courseId != null,
    staleTime: 5 * 60 * 1000,
  });
}
