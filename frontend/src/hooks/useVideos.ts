import { useCallback } from 'react';
import { apiClient, type Video, type VideoList as VideoListType } from '@/lib/api';
import { useI18nNavigate } from '@/lib/i18n';
import { useVideosStore } from '@/stores';


/**
 * Hook to fetch video list
 * Wraps Zustand store for backward compatibility
 */
interface UseVideosReturn {
  videos: VideoListType[];
  isLoading: boolean;
  error: string | null;
  loadVideos: (tagIds?: number[]) => Promise<void>;
}

export function useVideos(): UseVideosReturn {
  const { videos, isLoading, error, loadVideos } = useVideosStore();

  const handleLoadVideos = useCallback(async (tagIds?: number[]) => {
    await loadVideos(tagIds);
  }, [loadVideos]);

  return {
    videos,
    isLoading,
    error,
    loadVideos: handleLoadVideos,
  };
}

/**
 * Hook to fetch a single video
 */
interface UseVideoReturn {
  video: Video | null;
  isLoading: boolean;
  error: string | null;
  loadVideo: () => Promise<void>;
}

export function useVideo(videoId: number | null): UseVideoReturn {
  const navigate = useI18nNavigate();
  const { currentVideo, isLoading, error, loadVideo } = useVideosStore();

  const handleLoadVideo = useCallback(async () => {
    if (!videoId) return;

    const isAuthenticated = await apiClient.isAuthenticated();
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    await loadVideo(videoId);
  }, [videoId, loadVideo, navigate]);

  return {
    video: currentVideo,
    isLoading,
    error,
    loadVideo: handleLoadVideo,
  };
}

