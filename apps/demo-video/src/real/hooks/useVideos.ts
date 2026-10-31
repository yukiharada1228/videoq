import { demoCourse, useLocale } from '../data';

export const IN_PROGRESS_STATUSES = ['pending', 'processing', 'indexing', 'uploading'];
export type VideosOrdering = 'uploaded_at_desc' | 'uploaded_at_asc' | 'title_asc' | 'title_desc';

// The lesson being uploaded in the scene is not in the library yet.
export function useVideos(_params?: unknown) {
  const videos = demoCourse(useLocale()).videos.filter(video => video.id !== 4);
  return { videos, isLoading: false, error: null, isFetchingNextPage: false, hasNextPage: false, totalCount: videos.length, sentinelRef: () => {} };
}

export function useVideo(_videoId: number | null) {
  return { video: null, isLoading: false, error: null };
}
