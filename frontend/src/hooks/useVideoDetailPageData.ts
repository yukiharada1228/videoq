import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

interface UseVideoDetailPageMutationsParams {
  videoId: number | null;
  onDeleteSuccess: () => void;
  onUpdate: () => Promise<void>;
  onUpdateSuccess: () => void;
}

export function useVideoDetailPageMutations({
  videoId,
  onDeleteSuccess,
  onUpdate,
  onUpdateSuccess,
}: UseVideoDetailPageMutationsParams) {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!videoId) {
        return;
      }
      await apiClient.deleteVideo(videoId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.videos.all });
      onDeleteSuccess();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      await onUpdate();
    },
    onSuccess: async () => {
      onUpdateSuccess();
      if (videoId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.videos.detail(videoId) });
      }
    },
  });

  return {
    deleteMutation,
    updateMutation,
  };
}
