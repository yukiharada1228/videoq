import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { VideoStatusCounts } from '@videoq/trpc';
import { trpc } from '@/lib/trpc';
import { IN_PROGRESS_STATUSES } from '@/hooks/useVideos';

export type VideoStatus = 'uploading' | 'pending' | 'processing' | 'indexing' | 'completed' | 'error';

export const EMPTY_VIDEO_STATUS_COUNTS: VideoStatusCounts = {
  total: 0,
  completed: 0,
  pending: 0,
  processing: 0,
  indexing: 0,
  error: 0,
  uploading: 0,
};

export interface VideoLike {
  status: VideoStatus;
}

export interface VideoStats {
  total: number;
  completed: number;
  pending: number;
  processing: number;
  indexing: number;
  error: number;
}

/**
 * Custom hook to calculate video statistics
 * @param videos - Array of videos
 * @returns Statistics object
 */
export function useVideoStats<T extends VideoLike>(videos: T[]): VideoStats {
  return useMemo(() => {
    const stats = {
      total: videos.length,
      completed: 0,
      pending: 0,
      processing: 0,
      indexing: 0,
      error: 0,
    };

    for (const video of videos) {
      switch (video.status) {
        case 'completed':
          stats.completed++;
          break;
        case 'pending':
          stats.pending++;
          break;
        case 'processing':
          stats.processing++;
          break;
        case 'indexing':
          stats.indexing++;
          break;
        case 'error':
          stats.error++;
          break;
      }
    }

    return stats;
  }, [videos]);
}

export function useVideoStatusCounts(enabled = true) {
  const query = useQuery(trpc.videos.statusCounts.queryOptions(undefined, {
    enabled,
    staleTime: 30_000,
    refetchInterval: (query) => {
      const data = query.state.data;
      const hasInProgress = !!data && IN_PROGRESS_STATUSES.some((status) => data[status] > 0);
      return hasInProgress ? 3000 : false;
    },
  }));

  return {
    stats: query.data ?? EMPTY_VIDEO_STATUS_COUNTS,
    isLoading: query.isLoading,
    error: query.error,
  };
}
