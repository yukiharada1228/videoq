import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, type VideoCourse, type VideoList } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import {
  invalidateAfterGroupDelete,
  invalidateAfterGroupVideoRemove,
} from '@/lib/cacheInvalidation';
import { createVideoIdSet } from '@/lib/utils/videoConversion';

interface UseVideoCourseDetailQueryResult {
  course: VideoCourse | null;
  isLoading: boolean;
  isFetching: boolean;
  errorMessage: string | null;
}

export function useVideoCourseDetailQuery(courseId: number | null): UseVideoCourseDetailQueryResult {
  const courseQuery = useQuery<VideoCourse>({
    queryKey: queryKeys.videoCourses.detail(courseId),
    enabled: !!courseId,
    queryFn: async () => {
      if (!courseId) {
        throw new Error('Course ID is required');
      }
      return await apiClient.getVideoCourse(courseId);
    },
  });

  return {
    course: courseQuery.data ?? null,
    isLoading: courseQuery.isLoading,
    isFetching: courseQuery.isFetching,
    errorMessage: courseQuery.error instanceof Error ? courseQuery.error.message : null,
  };
}

interface UseAddableVideosQueryParams {
  isOpen: boolean;
  courseId: number | null;
  course: VideoCourse | null;
  q: string;
  status: string;
  ordering: string;
  tagIds: number[];
}

export function useAddableVideosQuery({
  isOpen,
  courseId,
  course,
  q,
  status,
  ordering,
  tagIds,
}: UseAddableVideosQueryParams) {
  const normalizedOrdering = (ordering || undefined) as NonNullable<
    Parameters<typeof apiClient.getVideos>[0]
  >['ordering'];

  return useQuery<VideoList[]>({
    queryKey: queryKeys.videoCourses.addableVideos({
      courseId,
      q,
      status,
      ordering,
      tagIds,
      currentVideoIds: (course?.videos?.map((v) => v.id) ?? []).slice().sort((a, b) => a - b),
    }),
    enabled: isOpen && !!course && !!courseId,
    queryFn: async () => {
      if (!course?.videos) {
        return [];
      }

      const response = await apiClient.getVideos({
        q: q || undefined,
        status: status || undefined,
        ordering: normalizedOrdering,
        tags: tagIds,
      });
      const currentVideoIdSet = createVideoIdSet(course.videos.map((v) => v.id));
      return response.data.filter((v) => !currentVideoIdSet.has(v.id));
    },
  });
}

interface UseVideoCourseDetailMutationsParams {
  courseId: number | null;
  onDeleteSuccess: () => void;
  onUpdateSuccess?: () => void;
}

export function useAddVideosToCourseMutation(courseId: number | null, onSuccess?: () => void | Promise<void>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (videoIds: number[]) => {
      if (!courseId) {
        throw new Error('Course ID is required');
      }
      return await apiClient.addVideosToCourse(courseId, videoIds);
    },
    onSuccess: async () => {
      if (courseId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.videoCourses.detail(courseId) });
      }
      await onSuccess?.();
    },
  });
}

export function useVideoCourseDetailMutations({
  courseId,
  onDeleteSuccess,
  onUpdateSuccess,
}: UseVideoCourseDetailMutationsParams) {
  const queryClient = useQueryClient();

  const syncCourseDetail = useCallback(async () => {
    if (!courseId) {
      return;
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.videoCourses.detail(courseId) });
  }, [courseId, queryClient]);

  const setCourseDetailCache = useCallback((nextGroup: VideoCourse) => {
    if (!courseId) {
      return;
    }
    queryClient.setQueryData<VideoCourse>(queryKeys.videoCourses.detail(courseId), nextGroup);
  }, [courseId, queryClient]);

  const addVideosMutation = useAddVideosToCourseMutation(courseId);

  const removeVideoMutation = useMutation({
    mutationFn: async (videoId: number) => {
      if (!courseId) {
        throw new Error('Course ID is required');
      }
      await apiClient.removeVideoFromCourse(courseId, videoId);
      return videoId;
    },
    onSuccess: async () => {
      if (courseId) {
        await invalidateAfterGroupVideoRemove(queryClient, courseId);
      }
    },
  });

  const reorderVideosMutation = useMutation({
    mutationFn: async (videoIds: number[]) => {
      if (!courseId) {
        throw new Error('Course ID is required');
      }
      await apiClient.reorderVideosInCourse(courseId, videoIds);
    },
  });

  const deleteCourseMutation = useMutation({
    mutationFn: async () => {
      if (!courseId) {
        throw new Error('Course ID is required');
      }
      await apiClient.deleteVideoCourse(courseId);
    },
    onSuccess: async () => {
      await invalidateAfterGroupDelete(queryClient);
      onDeleteSuccess();
    },
  });

  const updateCourseMutation = useMutation({
    mutationFn: async (payload: { name: string; description: string }) => {
      if (!courseId) {
        throw new Error('Course ID is required');
      }
      await apiClient.updateVideoCourse(courseId, payload);
    },
    onSuccess: async () => {
      onUpdateSuccess?.();
      await syncCourseDetail();
    },
  });

  return {
    syncCourseDetail,
    setCourseDetailCache,
    addVideosMutation,
    removeVideoMutation,
    reorderVideosMutation,
    deleteCourseMutation,
    updateCourseMutation,
  };
}
