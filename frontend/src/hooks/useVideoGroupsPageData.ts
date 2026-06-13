import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

interface CreateVideoGroupPayload {
  name: string;
  description: string;
}

interface UseCreateVideoGroupMutationParams {
  userId: number | null | undefined;
  onSuccess?: () => void | Promise<void>;
}

export function useCreateVideoGroupMutation({
  userId,
  onSuccess,
}: UseCreateVideoGroupMutationParams) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateVideoGroupPayload) => await apiClient.createVideoGroup(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.videoGroups.prefix });
      if (userId != null) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.videoGroups.all(userId) });
        await queryClient.invalidateQueries({ queryKey: queryKeys.videoGroups.infinite(userId) });
      }
      await onSuccess?.();
    },
  });
}

interface UseReorderVideoGroupsMutationParams {
  userId: number | null | undefined;
  onSuccess?: () => void | Promise<void>;
}

export function useReorderVideoGroupsMutation({
  userId,
  onSuccess,
}: UseReorderVideoGroupsMutationParams) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (groupIds: number[]) => await apiClient.reorderVideoGroups(groupIds),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.videoGroups.prefix });
      if (userId != null) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.videoGroups.all(userId) });
        await queryClient.invalidateQueries({ queryKey: queryKeys.videoGroups.infinite(userId) });
      }
      await onSuccess?.();
    },
  });
}
