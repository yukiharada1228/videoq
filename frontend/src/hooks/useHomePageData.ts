import { useQueries } from '@tanstack/react-query';
import { apiClient, type VideoList } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

interface UseHomePageDataParams {
  userId: string | null | undefined;
}

export function useHomePageData({ userId }: UseHomePageDataParams) {
  const [videosQuery, coursesQuery] = useQueries({
    queries: [
      {
        queryKey: [...queryKeys.videos.list(), { limit: 5, ordering: 'uploaded_at_desc' }],
        enabled: !!userId,
        queryFn: async (): Promise<VideoList[]> =>
          await apiClient
            .getVideos({ limit: 5, ordering: 'uploaded_at_desc' })
            .then((r) => r.data)
            .catch(() => []),
        initialData: [] as VideoList[],
      },
      {
        queryKey: [...queryKeys.videoCourses.all(userId ?? null), 'count'],
        enabled: !!userId,
        queryFn: async (): Promise<number> =>
          await apiClient.getVideoCoursesPage({ limit: 1 }).then((r) => r.meta.total).catch(() => 0),
        initialData: 0,
      },
    ],
  });

  return {
    videos: videosQuery.data ?? [],
    courseCount: coursesQuery.data ?? 0,
    isLoading: videosQuery.isLoading || coursesQuery.isLoading,
    videosQuery,
    coursesQuery,
  };
}
