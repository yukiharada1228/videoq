import { useState, useCallback, useLayoutEffect, useRef, type SetStateAction } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Video } from '@videoq/trpc';
import { appTrpcClient } from '@/lib/trpc';
import { invalidateAfterVideoUpdate } from '@/lib/cacheInvalidation';

interface UseVideoEditingOptions {
  video: Video | null;
  videoId: number | null;
}

type VideoDraft = { title?: string; description?: string; tagIds?: number[] };

export function useVideoEditing({ video, videoId }: UseVideoEditingOptions) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<VideoDraft>({});
  const latestTags = useRef(video?.tags);
  useLayoutEffect(() => { latestTags.current = video?.tags; }, [video?.tags]);
  const editedTitle = draft.title ?? video?.title ?? '';
  const editedDescription = draft.description ?? video?.description ?? '';
  const editedTagIds = draft.tagIds ?? video?.tags?.map(tag => tag.id) ?? [];
  const setEditedTitle = useCallback((title: string) => setDraft(current => ({ ...current, title })), []);
  const setEditedDescription = useCallback((description: string) => setDraft(current => ({ ...current, description })), []);
  const setEditedTagIds = useCallback((value: SetStateAction<number[]>) => {
    // Tag creation can complete after the server data has changed.
    const tagIds = latestTags.current?.map(tag => tag.id) ?? [];
    setDraft(current => ({
      ...current,
      tagIds: typeof value === 'function' ? value(current.tagIds ?? tagIds) : value,
    }));
  }, []);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!videoId || !video) return;

      const currentTagIds = video.tags?.map(tag => tag.id) || [];
      const tagsToAdd = editedTagIds.filter(id => !currentTagIds.includes(id));
      const tagsToRemove = currentTagIds.filter(id => !editedTagIds.includes(id));
      const metadata: { title?: string; description?: string } = {};
      if (editedTitle !== video.title) metadata.title = editedTitle;
      if (editedDescription !== (video.description ?? '')) metadata.description = editedDescription;
      const metadataChanged = Object.keys(metadata).length > 0;
      if (!metadataChanged && !tagsToAdd.length && !tagsToRemove.length) return;

      let tagsChanged = false;
      let updatedVideo: Video | undefined;
      try {
        if (metadataChanged) {
          updatedVideo = await appTrpcClient.videos.update.mutate({
            id: videoId,
            ...metadata,
          });
        }

        if (tagsToAdd.length > 0) {
          tagsChanged = true;
          await appTrpcClient.memberships.addTags.mutate({ videoId, tagIds: tagsToAdd });
        }

        // Finish all removals before refreshing, including when one fails.
        tagsChanged ||= tagsToRemove.length > 0;
        const removals = await Promise.allSettled(tagsToRemove.map(tagId =>
          appTrpcClient.memberships.removeTag.mutate({ videoId, tagId })
        ));
        const failed = removals.find(result => result.status === 'rejected');
        if (failed) throw failed.reason;
      } finally {
        // These requests can partially succeed; retries need the persisted state.
        await invalidateAfterVideoUpdate(queryClient, videoId, { metadataChanged, tagsChanged, updatedVideo });
      }
    },
    onSuccess: () => setIsEditing(false),
  });
  const { reset } = updateMutation;

  const startEditing = useCallback(() => {
    if (video) {
      setDraft({});
      reset();
      setIsEditing(true);
    }
  }, [video, reset]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setDraft({});
    reset();
  }, [reset]);

  return {
    isEditing,
    editedTitle,
    editedDescription,
    editedTagIds,
    setEditedTitle,
    setEditedDescription,
    setEditedTagIds,
    startEditing,
    cancelEditing,
    updateMutation,
  };
}
