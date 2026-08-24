import { useQuery } from '@tanstack/react-query';
import { apiClient, type VideoCourse } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

export function useSharedCourseQuery(shareToken: string) {
  return useQuery<VideoCourse>({
    queryKey: queryKeys.videoCourses.shared(shareToken),
    enabled: !!shareToken,
    queryFn: async () => await apiClient.getSharedCourse(shareToken),
  });
}
