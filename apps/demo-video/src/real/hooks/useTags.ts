export function useTags(_options: { enabled?: boolean } = {}) {
  return { tags: [], isLoading: false, error: null, createTag: async () => {}, updateTag: async () => {}, deleteTag: async () => {} };
}
