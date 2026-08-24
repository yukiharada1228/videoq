import { useQueries } from '@tanstack/react-query';
import { apiClient, type VideoCourseList, type VideoList } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

interface UseHomePageDataParams {
  userId: string | null | undefined;
}

export function useHomePageData({ userId }: UseHomePageDataParams) {
  const [videosQuery, coursesQuery] = useQueries({
    queries: [
      {
        queryKey: queryKeys.videos.list(),
        enabled: !!userId,
        queryFn: async (): Promise<VideoList[]> =>
          await apiClient.getVideos().then((r) => r.data).catch(() => []),
        initialData: [] as VideoList[],
      },
      {
        queryKey: queryKeys.videoCourses.all(userId ?? null),
        enabled: !!userId,
        queryFn: async (): Promise<VideoCourseList[]> => await apiClient.getVideoCourses().catch(() => []),
        initialData: [] as VideoCourseList[],
      },
    ],
  });

  return {
    videos: videosQuery.data ?? [],
    courses: coursesQuery.data ?? [],
    isLoading: videosQuery.isLoading || coursesQuery.isLoading,
    videosQuery,
    coursesQuery,
  };
}
