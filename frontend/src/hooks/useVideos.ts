import { useCallback, useMemo, useEffect, useState, useRef } from 'react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { apiClient, type Video, type VideoList as VideoListType } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/lib/queryKeys';

const PAGE_SIZE = 24;

export type VideosOrdering = 'uploaded_at_desc' | 'uploaded_at_asc' | 'title_asc' | 'title_desc';

interface UseVideosParams {
  tagIds?: number[];
  q?: string;
  status?: string;
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
  sentinelRef: React.RefCallback<HTMLElement>;
}

export function useVideos(params?: UseVideosParams): UseVideosReturn {
  const normalizedTagIds = useMemo(
    () => (params?.tagIds && params.tagIds.length > 0 ? params.tagIds : undefined),
    [params?.tagIds],
  );
  const q = params?.q?.trim() || undefined;
  const status = params?.status?.trim() || undefined;
  const ordering: VideosOrdering | undefined = params?.ordering || undefined;

  const videosQuery = useInfiniteQuery({
    queryKey: queryKeys.videos.infinite({ tags: normalizedTagIds, q, status, ordering }),
    queryFn: async ({ pageParam }) => {
      return apiClient.getVideos({
        tags: normalizedTagIds,
        q,
        status,
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

  // Keep a ref to the latest fetchNextPage so the observer is not recreated on every render
  const fetchNextPageRef = useRef(fetchNextPage);
  useEffect(() => {
    fetchNextPageRef.current = fetchNextPage;
  });

  const [sentinelNode, setSentinelNode] = useState<HTMLElement | null>(null);

  const sentinelRef: React.RefCallback<HTMLElement> = useCallback((node) => {
    setSentinelNode(node);
  }, []);

  useEffect(() => {
    if (!sentinelNode) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && videosQuery.hasNextPage && !videosQuery.isFetchingNextPage) {
        fetchNextPageRef.current();
      }
    });
    observer.observe(sentinelNode);
    return () => observer.disconnect();
  }, [sentinelNode, videosQuery.hasNextPage, videosQuery.isFetchingNextPage]);

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
    sentinelRef,
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
  const { user, isLoading: authLoading, refetch: refetchAuth } = useAuth();

  const videoQuery = useQuery<Video>({
    queryKey: queryKeys.videos.detail(videoId),
    enabled: !!videoId && !!user,
    queryFn: async () => {
      if (!videoId) {
        throw new Error('Video ID is required');
      }
      return await apiClient.getVideo(videoId);
    },
  });

  const handleLoadVideo = useCallback(async () => {
    if (!videoId) return;

    try {
      await refetchAuth();
    } catch {
      throw new Error('Authentication required');
    }

    const result = await videoQuery.refetch();
    if (result.error) {
      console.error('Failed to load video:', result.error);
      throw result.error;
    }
  }, [videoId, refetchAuth, videoQuery]);

  return {
    video: videoQuery.data || null,
    isLoading: (!!videoId && authLoading) || videoQuery.isLoading,
    error: videoQuery.error instanceof Error ? videoQuery.error.message : null,
    loadVideo: handleLoadVideo,
    refetch: handleLoadVideo,
  };
}
