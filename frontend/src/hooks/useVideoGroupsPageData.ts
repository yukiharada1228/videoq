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
      if (userId != null) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.videoGroups.all(userId) });
      }
      await onSuccess?.();
    },
  });
}
