import { create } from 'zustand';
import { apiClient, type Tag } from '@/lib/api';

interface TagsState {
  tags: Tag[];
  isLoading: boolean;
  error: string | null;
  setTags: (tags: Tag[]) => void;
  loadTags: () => Promise<void>;
  createTag: (name: string, color?: string) => Promise<Tag | null>;
  updateTag: (id: number, name?: string, color?: string) => Promise<Tag | null>;
  deleteTag: (id: number) => Promise<boolean>;
  reset: () => void;
}

const initialState = {
  tags: [],
  isLoading: false,
  error: null,
};

export const useTagsStore = create<TagsState>((set, get) => ({
  ...initialState,

  setTags: (tags) => set({ tags }),

  loadTags: async () => {
    set({ isLoading: true, error: null });
    try {
      const tags = await apiClient.getTags();
      set({ tags, isLoading: false, error: null });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to load tags';
      set({ isLoading: false, error: errorMessage });
    }
  },

  createTag: async (name: string, color?: string) => {
    set({ error: null });
    try {
      const newTag = await apiClient.createTag({ name, color });
      const { tags } = get();
      set({ tags: [...tags, newTag] });
      return newTag;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to create tag';
      set({ error: errorMessage });
      return null;
    }
  },

  updateTag: async (id: number, name?: string, color?: string) => {
    set({ error: null });
    try {
      const updatedTag = await apiClient.updateTag(id, { name, color });
      const { tags } = get();
      set({
        tags: tags.map((tag) => (tag.id === id ? updatedTag : tag)),
      });
      return updatedTag;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to update tag';
      set({ error: errorMessage });
      return null;
    }
  },

  deleteTag: async (id: number) => {
    set({ error: null });
    try {
      await apiClient.deleteTag(id);
      const { tags } = get();
      set({ tags: tags.filter((tag) => tag.id !== id) });
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to delete tag';
      set({ error: errorMessage });
      return false;
    }
  },

  reset: () => set(initialState),
}));
