import { useCallback, useEffect } from 'react';
import { useTagsStore } from '@/stores';
import type { Tag } from '@/lib/api';

/**
 * Hook to manage tags
 * Wraps Zustand store for backward compatibility
 */
export function useTags() {
  const {
    tags,
    isLoading,
    error,
    loadTags,
    createTag: storeCreateTag,
    updateTag: storeUpdateTag,
    deleteTag: storeDeleteTag,
  } = useTagsStore();

  const handleLoadTags = useCallback(async () => {
    await loadTags();
  }, [loadTags]);

  const createTag = useCallback(
    async (name: string, color?: string): Promise<Tag | undefined> => {
      const result = await storeCreateTag(name, color);
      return result ?? undefined;
    },
    [storeCreateTag]
  );

  const updateTag = useCallback(
    async (id: number, name?: string, color?: string): Promise<Tag | undefined> => {
      const result = await storeUpdateTag(id, name, color);
      return result ?? undefined;
    },
    [storeUpdateTag]
  );

  const deleteTag = useCallback(
    async (id: number): Promise<void> => {
      await storeDeleteTag(id);
    },
    [storeDeleteTag]
  );

  // Load tags on mount
  useEffect(() => {
    handleLoadTags().catch(() => {
      // Error is handled by store
    });
  }, [handleLoadTags]);

  return {
    tags,
    isLoading,
    error,
    loadTags: handleLoadTags,
    refetchTags: handleLoadTags,
    createTag,
    updateTag,
    deleteTag,
  };
}
