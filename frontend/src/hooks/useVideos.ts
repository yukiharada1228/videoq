import { useCallback, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient, type Video, type VideoList as VideoListType } from '@/lib/api';
import { useI18nNavigate } from '@/lib/i18n';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Hook to fetch video list
 */
interface UseVideosReturn {
  videos: VideoListType[];
  isLoading: boolean;
  error: string | null;
  loadVideos: (tagIds?: number[]) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useVideos(tagIds?: number[]): UseVideosReturn {
  const normalizedTagIds = useMemo(
    () => (tagIds && tagIds.length > 0 ? tagIds : undefined),
    [tagIds],
  );

  const videosQuery = useQuery<VideoListType[]>({
    queryKey: queryKeys.videos.list({ tags: normalizedTagIds }),
    queryFn: async () => await apiClient.getVideos({ tags: normalizedTagIds }),
  });

  const handleRefetch = useCallback(async () => {
    const result = await videosQuery.refetch();
    if (result.error) {
      console.error('Failed to load video:', result.error);
      throw result.error;
    }
  }, [videosQuery]);

  return {
    videos: videosQuery.data || [],
    isLoading: videosQuery.isLoading || videosQuery.isFetching,
    error: videosQuery.error instanceof Error ? videosQuery.error.message : null,
    loadVideos: handleRefetch,
    refetch: handleRefetch,
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
  refetch: () => Promise<void>;
}

export function useVideo(videoId: number | null): UseVideoReturn {
  const navigate = useI18nNavigate();
  const authQuery = useQuery<boolean>({
    queryKey: ['auth', 'status', videoId],
    enabled: !!videoId,
    queryFn: async () => await apiClient.isAuthenticated(),
    retry: false,
  });
  const isAuthenticated = authQuery.data ?? false;

  useEffect(() => {
    if (videoId && authQuery.isFetched && !isAuthenticated) {
      navigate('/login');
    }
  }, [videoId, authQuery.isFetched, isAuthenticated, navigate]);

  const videoQuery = useQuery<Video>({
    queryKey: queryKeys.videos.detail(videoId),
    enabled: !!videoId && isAuthenticated,
    queryFn: async () => {
      if (!videoId) {
        throw new Error('Video ID is required');
      }
      return await apiClient.getVideo(videoId);
    },
  });

  const handleLoadVideo = useCallback(async () => {
    if (!videoId) return;

    const authenticated = await apiClient.isAuthenticated();
    if (!authenticated) {
      navigate('/login');
      throw new Error('Authentication required');
    }

    const result = await videoQuery.refetch();
    if (result.error) {
      console.error('Failed to load video:', result.error);
      throw result.error;
    }
  }, [videoId, navigate, videoQuery]);

  return {
    video: videoQuery.data || null,
    isLoading: (!!videoId && authQuery.isLoading) || videoQuery.isLoading || videoQuery.isFetching,
    error: videoQuery.error instanceof Error ? videoQuery.error.message : null,
    loadVideo: handleLoadVideo,
    refetch: handleLoadVideo,
  };
}
