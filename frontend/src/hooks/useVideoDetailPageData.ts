import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

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
        queryClient.removeQueries({ queryKey: queryKeys.videos.detail(videoId) });
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.videos.all });
      await queryClient.invalidateQueries({ queryKey: ['videoGroup'] });
      await queryClient.invalidateQueries({ queryKey: ['sharedVideoGroup'] });
      await queryClient.invalidateQueries({ queryKey: ['popularScenes'] });
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
        await queryClient.invalidateQueries({ queryKey: queryKeys.videos.detail(videoId) });
        await queryClient.invalidateQueries({ queryKey: queryKeys.videos.all });
        await queryClient.invalidateQueries({ queryKey: ['videoGroup'] });
        await queryClient.invalidateQueries({ queryKey: ['sharedVideoGroup'] });
      }
    },
  });

  return {
    deleteMutation,
    updateMutation,
  };
}
