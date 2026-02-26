import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
}

export function useVideos(): UseVideosReturn {
  const queryClient = useQueryClient();
  const [requestedTagIds, setRequestedTagIds] = useState<number[] | undefined>(undefined);
  const [hasRequested, setHasRequested] = useState(false);

  const normalizedTagIds = useMemo(
    () => (requestedTagIds && requestedTagIds.length > 0 ? requestedTagIds : undefined),
    [requestedTagIds],
  );

  const videosQuery = useQuery<VideoListType[]>({
    queryKey: queryKeys.videos.list({ tags: normalizedTagIds }),
    enabled: hasRequested,
    queryFn: async () => await apiClient.getVideos({ tags: normalizedTagIds }),
  });

  const handleLoadVideos = useCallback(async (tagIds?: number[]) => {
    const normalized = tagIds && tagIds.length > 0 ? tagIds : undefined;
    setRequestedTagIds(normalized);
    setHasRequested(true);

    try {
      await queryClient.fetchQuery({
        queryKey: queryKeys.videos.list({ tags: normalized }),
        queryFn: async () => await apiClient.getVideos({ tags: normalized }),
      });
    } catch (error) {
      console.error('Failed to load video:', error);
      throw error;
    }
  }, [queryClient]);

  return {
    videos: videosQuery.data || [],
    isLoading: videosQuery.isLoading || videosQuery.isFetching,
    error: videosQuery.error instanceof Error ? videosQuery.error.message : null,
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
  const queryClient = useQueryClient();
  const [hasRequested, setHasRequested] = useState(false);

  const videoQuery = useQuery<Video>({
    queryKey: queryKeys.videos.detail(videoId),
    enabled: hasRequested && !!videoId,
    queryFn: async () => {
      if (!videoId) {
        throw new Error('Video ID is required');
      }
      return await apiClient.getVideo(videoId);
    },
  });

  const handleLoadVideo = useCallback(async () => {
    if (!videoId) return;

    if (!apiClient.isAuthenticated()) {
      navigate('/login');
      throw new Error('Authentication required');
    }

    setHasRequested(true);

    try {
      await queryClient.fetchQuery({
        queryKey: queryKeys.videos.detail(videoId),
        queryFn: async () => await apiClient.getVideo(videoId),
      });
    } catch (error) {
      console.error('Failed to load video:', error);
      throw error;
    }
  }, [videoId, navigate, queryClient]);

  return {
    video: videoQuery.data || null,
    isLoading: videoQuery.isLoading || videoQuery.isFetching,
    error: videoQuery.error instanceof Error ? videoQuery.error.message : null,
    loadVideo: handleLoadVideo,
  };
}
