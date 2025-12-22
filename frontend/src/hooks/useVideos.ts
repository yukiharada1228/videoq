import { useCallback } from 'react';
import { apiClient, type Video, type VideoList as VideoListType } from '@/lib/api';
import { useI18nNavigate } from '@/lib/i18n';
import { useAsyncState } from './useAsyncState';

/**
 * Hook to fetch video list
 */
interface UseVideosReturn {
  videos: VideoListType[];
  isLoading: boolean;
  error: string | null;
  loadVideos: () => Promise<void>;
}

export function useVideos(): UseVideosReturn {
  const { data: videos, isLoading, error, execute: loadVideos } = useAsyncState<VideoListType[]>({
    initialData: [],
    onError: (error) => {
      console.error('Failed to load video:', error);
    },
  });

  const handleLoadVideos = useCallback(async () => {
    await loadVideos(async () => {
      return await apiClient.getVideos();
    });
  }, [loadVideos]);

  return {
    videos: videos || [],
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

  const { data: video, isLoading, error, execute: loadVideo } = useAsyncState<Video>({
    initialData: null,
    onError: (error) => {
      console.error('Failed to load video:', error);
    },
  });

  const handleLoadVideo = useCallback(async () => {
    if (!videoId) return;

    await loadVideo(async () => {
      if (!apiClient.isAuthenticated()) {
        navigate('/login');
        throw new Error('Authentication required');
      }
      return await apiClient.getVideo(videoId);
    });
  }, [videoId, loadVideo, navigate]);

  return {
    video: video || null,
    isLoading,
    error,
    loadVideo: handleLoadVideo,
  };
}

