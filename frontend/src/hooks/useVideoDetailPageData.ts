import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import {
  invalidateAfterVideoDelete,
  invalidateAfterVideoUpdate,
} from '@/lib/cacheInvalidation';

interface UseVideoDetailPageMutationsParams {
  videoId: number | null;
  onDeleteSuccess: () => void;
  onDeleteError?: (err: unknown) => void;
  onUpdate: () => Promise<void>;
  onUpdateSuccess: () => void;
}

export function useVideoDetailPageMutations({
  videoId,
  onDeleteSuccess,
  onDeleteError,
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
      if (videoId) {
        await invalidateAfterVideoDelete(queryClient, videoId);
      }
      onDeleteSuccess();
    },
    onError: (err) => {
      onDeleteError?.(err);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      await onUpdate();
    },
    onSuccess: async () => {
      onUpdateSuccess();
      if (videoId) {
        await invalidateAfterVideoUpdate(queryClient, videoId);
      }
    },
  });

  return {
    deleteMutation,
    updateMutation,
  };
}
