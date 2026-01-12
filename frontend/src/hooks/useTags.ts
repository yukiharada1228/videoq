import { useState, useCallback, useEffect } from 'react';
import { apiClient, type Tag } from '@/lib/api';
import { useAsyncState } from './useAsyncState';

export function useTags() {
  const [tags, setTags] = useState<Tag[]>([]);
  const { isLoading, error, execute } = useAsyncState();

  const loadTags = useCallback(async () => {
    await execute(async () => {
      const data = await apiClient.getTags();
      setTags(data);
      return data;
    });
  }, [execute]);

  const createTag = useCallback(
    async (name: string, color?: string) => {
      return execute(async () => {
        const newTag = await apiClient.createTag({ name, color });
        setTags((prev) => [...prev, newTag]);
        return newTag;
      });
    },
    [execute]
  );

  const updateTag = useCallback(
    async (id: number, name?: string, color?: string) => {
      return execute(async () => {
        const updatedTag = await apiClient.updateTag(id, { name, color });
        setTags((prev) =>
          prev.map((tag) => (tag.id === id ? updatedTag : tag))
        );
        return updatedTag;
      });
    },
    [execute]
  );

  const deleteTag = useCallback(
    async (id: number) => {
      await execute(async () => {
        await apiClient.deleteTag(id);
        setTags((prev) => prev.filter((tag) => tag.id !== id));
      });
    },
    [execute]
  );

  // Load tags on mount
  useEffect(() => {
    void loadTags();
  }, [loadTags]);

  return {
    tags,
    isLoading,
    error,
    loadTags,
    refetchTags: loadTags,
    createTag,
    updateTag,
    deleteTag,
  };
}
