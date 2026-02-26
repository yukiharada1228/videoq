import { useQueries } from '@tanstack/react-query';
import { apiClient, type VideoGroupList, type VideoList } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

interface UseHomePageDataParams {
  userId: number | null | undefined;
}

export function useHomePageData({ userId }: UseHomePageDataParams) {
  const [videosQuery, groupsQuery] = useQueries({
    queries: [
      {
        queryKey: queryKeys.videos.list(),
        enabled: !!userId,
        queryFn: async (): Promise<VideoList[]> => await apiClient.getVideos().catch(() => []),
        initialData: [] as VideoList[],
      },
      {
        queryKey: queryKeys.videoGroups.all(userId ?? null),
        enabled: !!userId,
        queryFn: async (): Promise<VideoGroupList[]> => await apiClient.getVideoGroups().catch(() => []),
        initialData: [] as VideoGroupList[],
      },
    ],
  });

  return {
    videos: videosQuery.data ?? [],
    groups: groupsQuery.data ?? [],
    isLoading: videosQuery.isLoading || groupsQuery.isLoading,
    videosQuery,
    groupsQuery,
  };
}
