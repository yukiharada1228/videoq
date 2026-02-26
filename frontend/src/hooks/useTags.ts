import { useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, type Tag } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

export function useTags() {
  const queryClient = useQueryClient();

  const tagsQuery = useQuery<Tag[]>({
    queryKey: queryKeys.tags.all,
    queryFn: async () => await apiClient.getTags(),
  });

  const createTagMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color?: string }) =>
      await apiClient.createTag({ name, color }),
  });

  const updateTagMutation = useMutation({
    mutationFn: async ({ id, name, color }: { id: number; name?: string; color?: string }) =>
      await apiClient.updateTag(id, { name, color }),
  });

  const deleteTagMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiClient.deleteTag(id);
      return id;
    },
  });

  const createTag = useCallback(
    async (name: string, color?: string) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tags.all });
      const newTag = await createTagMutation.mutateAsync({ name, color });
      queryClient.setQueryData<Tag[]>(queryKeys.tags.all, (prev = []) => [...prev, newTag]);
      await queryClient.invalidateQueries({ queryKey: queryKeys.tags.all, refetchType: 'none' });
      return newTag;
    },
    [createTagMutation, queryClient]
  );

  const updateTag = useCallback(
    async (id: number, name?: string, color?: string) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tags.all });
      const updatedTag = await updateTagMutation.mutateAsync({ id, name, color });
      queryClient.setQueryData<Tag[]>(
        queryKeys.tags.all,
        (prev = []) => prev.map((tag) => (tag.id === updatedTag.id ? updatedTag : tag)),
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.tags.all, refetchType: 'none' });
      return updatedTag;
    },
    [queryClient, updateTagMutation]
  );

  const deleteTag = useCallback(
    async (id: number) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tags.all });
      await deleteTagMutation.mutateAsync(id);
      queryClient.setQueryData<Tag[]>(
        queryKeys.tags.all,
        (prev = []) => prev.filter((tag) => tag.id !== id),
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.tags.all, refetchType: 'none' });
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

  return {
    tags: tagsQuery.data ?? [],
    isLoading,
    error,
    loadTags,
    refetchTags: loadTags,
    createTag,
    updateTag,
    deleteTag,
  };
}
