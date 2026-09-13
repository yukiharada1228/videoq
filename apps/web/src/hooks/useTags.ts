import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import type { TagPage } from '@videoq/trpc';
import { trpc } from '@/lib/trpc';
import {
  DEFAULT_TAG_CHIP_COLOR,
  isTagChipColor,
} from '@/lib/tagColors';

const TAG_LIST_INPUT = { limit: 100, offset: 0 } as const;

function emptyTagPage(): TagPage {
  return {
    data: [],
    meta: { total: 0, ...TAG_LIST_INPUT },
  };
}

export function useTags() {
  const queryClient = useQueryClient();

  const tagsQuery = useQuery(trpc.tags.list.queryOptions(TAG_LIST_INPUT));

  const createTagMutation = useMutation(trpc.tags.create.mutationOptions());

  const updateTagMutation = useMutation(trpc.tags.update.mutationOptions());

  const deleteTagMutation = useMutation(trpc.tags.delete.mutationOptions());

  const createTag = useCallback(
    async (name: string, color?: string) => {
      const selectedColor = color ?? DEFAULT_TAG_CHIP_COLOR;
      if (!isTagChipColor(selectedColor)) {
        throw new Error(`Invalid tag color: ${selectedColor}`);
      }

      await queryClient.cancelQueries(trpc.tags.list.queryFilter(TAG_LIST_INPUT));
      const newTag = await createTagMutation.mutateAsync({
        name,
        color: selectedColor,
      });
      queryClient.setQueryData(trpc.tags.list.queryKey(TAG_LIST_INPUT), (previous) => {
        const page = previous ?? emptyTagPage();
        return {
          data: [...page.data, newTag],
          meta: { ...page.meta, total: page.meta.total + 1 },
        };
      });
      return newTag;
    },
    [createTagMutation, queryClient]
  );

  const updateTag = useCallback(
    async (id: number, name?: string, color?: string) => {
      if (color !== undefined && !isTagChipColor(color)) {
        throw new Error(`Invalid tag color: ${color}`);
      }

      await queryClient.cancelQueries(trpc.tags.list.queryFilter(TAG_LIST_INPUT));
      const updatedTag = await updateTagMutation.mutateAsync({ id, name, color });
      queryClient.setQueryData(trpc.tags.list.queryKey(TAG_LIST_INPUT), (previous) => {
        const page = previous ?? emptyTagPage();
        return {
          ...page,
          data: page.data.map((tag) =>
            tag.id === updatedTag.id ? updatedTag : tag,
          ),
        };
      });
      return updatedTag;
    },
    [updateTagMutation, queryClient]
  );

  const deleteTag = useCallback(
    async (id: number) => {
      await queryClient.cancelQueries(trpc.tags.list.queryFilter(TAG_LIST_INPUT));
      await deleteTagMutation.mutateAsync({ id });
      queryClient.setQueryData(trpc.tags.list.queryKey(TAG_LIST_INPUT), (previous) => {
        const page = previous ?? emptyTagPage();
        const data = page.data.filter((tag) => tag.id !== id);
        return {
          data,
          meta: {
            ...page.meta,
            total: Math.max(0, page.meta.total - (data.length < page.data.length ? 1 : 0)),
          },
        };
      });
    },
    [deleteTagMutation, queryClient]
  );

  useEffect(() => {
    if (tagsQuery.error) {
      console.error('Failed to load tags:', tagsQuery.error);
    }
  }, [tagsQuery.error]);

  const loadTags = useCallback(async () => {
    await tagsQuery.refetch();
  }, [tagsQuery]);

  const errorSource =
    tagsQuery.error ??
    createTagMutation.error ??
    updateTagMutation.error ??
    deleteTagMutation.error;
  const error = errorSource instanceof Error ? errorSource.message : null;
  const isLoading =
    tagsQuery.isLoading ||
    createTagMutation.isPending ||
    updateTagMutation.isPending ||
    deleteTagMutation.isPending;
  // `isLoading` also covers list refetches and the other mutations, so it
  // cannot drive a per-tag indicator. `variables` holds the argument passed to
  // mutateAsync, which identifies the tag whose deletion is in flight.
  const deletingTagId = deleteTagMutation.isPending
    ? deleteTagMutation.variables?.id ?? null
    : null;

  return {
    tags: tagsQuery.data?.data ?? [],
    isLoading,
    deletingTagId,
    error,
    loadTags,
    refetchTags: loadTags,
    createTag,
    updateTag,
    deleteTag,
  };
}
