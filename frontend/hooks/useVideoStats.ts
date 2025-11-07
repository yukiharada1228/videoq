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
 * 動画の統計情報を計算するカスタムフック（DRY原則）
 * @param videos - 動画の配列
 * @returns 統計情報オブジェクト
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

