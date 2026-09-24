import { useQuery } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc';

interface UseHomePageDataParams {
  userId: string | null | undefined;
}

export function useHomePageData({ userId }: UseHomePageDataParams) {
  const videosQuery = useQuery(trpc.videos.list.queryOptions({
    limit: 5,
    ordering: 'uploaded_at_desc',
  }, {
    enabled: !!userId,
  }));
  const coursesQuery = useQuery(trpc.courses.list.queryOptions({ limit: 1 }, {
    enabled: !!userId,
  }));

  return {
    videos: videosQuery.data?.data ?? [],
    courseCount: coursesQuery.data?.meta.total ?? 0,
    isLoading: videosQuery.isLoading || coursesQuery.isLoading,
  };
}
