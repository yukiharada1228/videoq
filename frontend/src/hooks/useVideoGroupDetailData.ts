import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, type VideoGroup, type VideoList } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { createVideoIdSet } from '@/lib/utils/videoConversion';

interface UseVideoGroupDetailQueryResult {
  group: VideoGroup | null;
  isLoading: boolean;
  isFetching: boolean;
  errorMessage: string | null;
}

export function useVideoGroupDetailQuery(groupId: number | null): UseVideoGroupDetailQueryResult {
  const groupQuery = useQuery<VideoGroup>({
    queryKey: queryKeys.videoGroups.detail(groupId),
    enabled: !!groupId,
    queryFn: async () => {
      if (!groupId) {
        throw new Error('Group ID is required');
      }
      return await apiClient.getVideoGroup(groupId);
    },
  });

  return {
    group: groupQuery.data ?? null,
    isLoading: groupQuery.isLoading,
    isFetching: groupQuery.isFetching,
    errorMessage: groupQuery.error instanceof Error ? groupQuery.error.message : null,
  };
}

interface UseAddableVideosQueryParams {
  isOpen: boolean;
  groupId: number | null;
  group: VideoGroup | null;
  q: string;
  status: string;
  ordering: string;
  tagIds: number[];
}

export function useAddableVideosQuery({
  isOpen,
  groupId,
  group,
  q,
  status,
  ordering,
  tagIds,
}: UseAddableVideosQueryParams) {
  const normalizedOrdering = (ordering || undefined) as NonNullable<
    Parameters<typeof apiClient.getVideos>[0]
  >['ordering'];

  return useQuery<VideoList[]>({
    queryKey: queryKeys.videoGroups.addableVideos({
      groupId,
      q,
      status,
      ordering,
      tagIds,
      currentVideoIds: (group?.videos?.map((v) => v.id) ?? []).slice().sort((a, b) => a - b),
    }),
    enabled: isOpen && !!group && !!groupId,
    queryFn: async () => {
      if (!group?.videos) {
        return [];
      }

      const videos = await apiClient.getVideos({
        q: q || undefined,
        status: status || undefined,
        ordering: normalizedOrdering,
        tags: tagIds,
      });
      const currentVideoIdSet = createVideoIdSet(group.videos.map((v) => v.id));
      return videos.filter((v) => !currentVideoIdSet.has(v.id));
    },
  });
}

interface UseVideoGroupDetailMutationsParams {
  groupId: number | null;
  onDeleteSuccess: () => void;
  onUpdateSuccess?: () => void;
}

export function useAddVideosToGroupMutation(groupId: number | null, onSuccess?: () => void | Promise<void>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (videoIds: number[]) => {
      if (!groupId) {
        throw new Error('Group ID is required');
      }
      return await apiClient.addVideosToGroup(groupId, videoIds);
    },
    onSuccess: async () => {
      if (groupId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.videoGroups.detail(groupId) });
      }
      await onSuccess?.();
    },
  });
}

export function useVideoGroupDetailMutations({
  groupId,
  onDeleteSuccess,
  onUpdateSuccess,
}: UseVideoGroupDetailMutationsParams) {
  const queryClient = useQueryClient();

  const syncGroupDetail = useCallback(async () => {
    if (!groupId) {
      return;
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.videoGroups.detail(groupId) });
  }, [groupId, queryClient]);

  const setGroupDetailCache = useCallback((nextGroup: VideoGroup) => {
    if (!groupId) {
      return;
    }
    queryClient.setQueryData<VideoGroup>(queryKeys.videoGroups.detail(groupId), nextGroup);
  }, [groupId, queryClient]);

  const addVideosMutation = useAddVideosToGroupMutation(groupId);

  const removeVideoMutation = useMutation({
    mutationFn: async (videoId: number) => {
      if (!groupId) {
        throw new Error('Group ID is required');
      }
      await apiClient.removeVideoFromGroup(groupId, videoId);
      return videoId;
    },
    onSuccess: syncGroupDetail,
  });

  const reorderVideosMutation = useMutation({
    mutationFn: async (videoIds: number[]) => {
      if (!groupId) {
        throw new Error('Group ID is required');
      }
      await apiClient.reorderVideosInGroup(groupId, videoIds);
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async () => {
      if (!groupId) {
        throw new Error('Group ID is required');
      }
      await apiClient.deleteVideoGroup(groupId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['videoGroups'] });
      onDeleteSuccess();
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: async (payload: { name: string; description: string }) => {
      if (!groupId) {
        throw new Error('Group ID is required');
      }
      await apiClient.updateVideoGroup(groupId, payload);
    },
    onSuccess: async () => {
      onUpdateSuccess?.();
      await syncGroupDetail();
    },
  });

  return {
    syncGroupDetail,
    setGroupDetailCache,
    addVideosMutation,
    removeVideoMutation,
    reorderVideosMutation,
    deleteGroupMutation,
    updateGroupMutation,
  };
}
