export function useVideoStatusCounts(_enabled = true) {
  return { stats: { total: 5, completed: 4, pending: 0, processing: 0, indexing: 0, error: 0, uploading: 1 }, isLoading: false, error: null };
}
