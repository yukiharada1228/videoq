import { useQuery } from '@tanstack/react-query';
import { apiClient, type VideoGroup } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

export function useSharedGroupQuery(shareToken: string) {
  return useQuery<VideoGroup>({
    queryKey: queryKeys.videoGroups.shared(shareToken),
    enabled: !!shareToken,
    queryFn: async () => await apiClient.getSharedGroup(shareToken),
  });
}
