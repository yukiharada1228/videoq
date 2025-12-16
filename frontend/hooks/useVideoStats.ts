import { useMemo } from 'react';

export type VideoStatus = 'pending' | 'processing' | 'completed' | 'error';

export interface VideoLike {
  status: VideoStatus;
}

export interface VideoStats {
  total: number;
  completed: number;
  pending: number;
  processing: number;
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
        case 'error':
          stats.error++;
          break;
      }
    }

    return stats;
  }, [videos]);
}

