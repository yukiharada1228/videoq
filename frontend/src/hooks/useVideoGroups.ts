import { useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient, type VideoGroupList } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/lib/queryKeys';

interface UseVideoGroupsReturn {
  groups: VideoGroupList[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetch the list of video groups.
 * - Reload following user changes (user?.id)
 * - Refetch when trigger becomes true (e.g., when modal is opened)
 * - Don't setState after component unmount/hide (trigger=false)
 */
export function useVideoGroups(trigger: boolean = true): UseVideoGroupsReturn {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const groupsQuery = useQuery<VideoGroupList[]>({
    queryKey: queryKeys.videoGroups.all(userId),
    enabled: trigger && userId !== null,
    queryFn: async () => {
      return await apiClient.getVideoGroups();
    },
  });

  useEffect(() => {
    if (groupsQuery.error) {
      console.error('Failed to load video groups', groupsQuery.error);
    }
  }, [groupsQuery.error]);

  const refetch = useCallback(() => {
    if (userId === null || !trigger) {
      return;
    }
    void groupsQuery.refetch();
  }, [groupsQuery, trigger, userId]);

  return {
    groups: groupsQuery.data ?? [],
    isLoading: groupsQuery.isLoading,
    error: groupsQuery.error instanceof Error ? groupsQuery.error.message : null,
    refetch,
  };
}
