import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

interface CreateVideoCoursePayload {
  name: string;
  description: string;
}

interface UseCreateVideoCourseMutationParams {
  userId: string | null | undefined;
  onSuccess?: () => void | Promise<void>;
}

export function useCreateVideoCourseMutation({
  userId,
  onSuccess,
}: UseCreateVideoCourseMutationParams) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateVideoCoursePayload) => await apiClient.createVideoCourse(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.videoCourses.prefix });
      if (userId != null) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.videoCourses.all(userId) });
        await queryClient.invalidateQueries({ queryKey: queryKeys.videoCourses.infinite(userId) });
      }
      await onSuccess?.();
    },
  });
}

interface UseReorderVideoCoursesMutationParams {
  userId: string | null | undefined;
  onSuccess?: () => void | Promise<void>;
}

export function useReorderVideoCoursesMutation({
  userId,
  onSuccess,
}: UseReorderVideoCoursesMutationParams) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (courseIds: number[]) => await apiClient.reorderVideoCourses(courseIds),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.videoCourses.prefix });
      if (userId != null) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.videoCourses.all(userId) });
        await queryClient.invalidateQueries({ queryKey: queryKeys.videoCourses.infinite(userId) });
      }
      await onSuccess?.();
    },
  });
}
