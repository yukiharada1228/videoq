import { useCallback, useMemo, useEffect } from 'react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { apiClient, type Video, type VideoList as VideoListType } from '@/lib/api';
import { useI18nNavigate } from '@/lib/i18n';
import { queryKeys } from '@/lib/queryKeys';

const PAGE_SIZE = 20;

export type VideosOrdering = 'uploaded_at_desc' | 'uploaded_at_asc' | 'title_asc' | 'title_desc';

interface UseVideosParams {
  tagIds?: number[];
  q?: string;
  ordering?: VideosOrdering;
}

/**
 * Hook to fetch video list with infinite scroll pagination
 */
interface UseVideosReturn {
  videos: VideoListType[];
  isLoading: boolean;
  error: string | null;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
  totalCount: number;
  loadVideos: () => Promise<void>;
  refetch: () => Promise<void>;
}

export function useVideos(params?: UseVideosParams): UseVideosReturn {
  const normalizedTagIds = useMemo(
    () => (params?.tagIds && params.tagIds.length > 0 ? params.tagIds : undefined),
    [params?.tagIds],
  );
  const q = params?.q || undefined;
  const ordering: VideosOrdering | undefined = params?.ordering || undefined;

  const videosQuery = useInfiniteQuery({
    queryKey: queryKeys.videos.infinite({ tags: normalizedTagIds, q, ordering }),
    queryFn: async ({ pageParam }) => {
      return apiClient.getVideos({
        tags: normalizedTagIds,
        q,
        ordering,
        limit: PAGE_SIZE,
        offset: pageParam as number,
      });
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.next) return undefined;
      return allPages.reduce((sum, page) => sum + page.results.length, 0);
    },
  });

  const videos = useMemo(
    () => videosQuery.data?.pages.flatMap((page) => page.results) ?? [],
    [videosQuery.data],
  );

  const totalCount = videosQuery.data?.pages[0]?.count ?? 0;

  const handleRefetch = useCallback(async () => {
    const result = await videosQuery.refetch();
    if (result.error) {
      console.error('Failed to load videos:', result.error);
      throw result.error;
    }
  }, [videosQuery]);

  const fetchNextPage = useCallback(() => {
    void videosQuery.fetchNextPage();
  }, [videosQuery]);

  return {
    videos,
    isLoading: videosQuery.isLoading,
    error: videosQuery.error instanceof Error ? videosQuery.error.message : null,
    hasNextPage: videosQuery.hasNextPage,
    fetchNextPage,
    isFetchingNextPage: videosQuery.isFetchingNextPage,
    totalCount,
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
    isLoading: (!!videoId && authQuery.isLoading) || videoQuery.isLoading,
    error: videoQuery.error instanceof Error ? videoQuery.error.message : null,
    loadVideo: handleLoadVideo,
    refetch: handleLoadVideo,
  };
}
