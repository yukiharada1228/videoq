import { useCallback, useEffect, useMemo, useRef, useState, type RefCallback } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient, type VideoCourseList } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/lib/queryKeys';

const PAGE_SIZE = 24;

interface UseVideoCoursesReturn {
  courses: VideoCourseList[];
  isLoading: boolean;
  error: string | null;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
  totalCount: number;
  refetch: () => Promise<void>;
  sentinelRef: RefCallback<HTMLElement>;
}

/**
 * Fetch the list of video courses with infinite scroll pagination.
 * Keeps the original public fields while adding page-loading controls.
 */
export function useVideoCourses(trigger: boolean = true): UseVideoCoursesReturn {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const coursesQuery = useInfiniteQuery({
    queryKey: queryKeys.videoCourses.infinite(userId),
    enabled: trigger && userId !== null,
    queryFn: async ({ pageParam }) => (
      apiClient.getVideoCoursesPage({
        limit: PAGE_SIZE,
        offset: pageParam as number,
      })
    ),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, page) => sum + page.data.length, 0);
      if (loaded >= lastPage.meta.total) return undefined;
      return loaded;
    },
  });

  const courses = useMemo(
    () => coursesQuery.data?.pages.flatMap((page) => page.data) ?? [],
    [coursesQuery.data],
  );

  const totalCount = coursesQuery.data?.pages[0]?.meta.total ?? 0;

  useEffect(() => {
    if (coursesQuery.error) {
      console.error('Failed to load video courses', coursesQuery.error);
    }
  }, [coursesQuery.error]);

  const refetch = useCallback(async () => {
    if (userId === null || !trigger) {
      return;
    }
    const result = await coursesQuery.refetch();
    if (result.error) {
      throw result.error;
    }
  }, [coursesQuery, trigger, userId]);

  const fetchNextPage = useCallback(() => {
    void coursesQuery.fetchNextPage();
  }, [coursesQuery]);

  const fetchNextPageRef = useRef(fetchNextPage);
  useEffect(() => {
    fetchNextPageRef.current = fetchNextPage;
  });

  const [sentinelNode, setSentinelNode] = useState<HTMLElement | null>(null);
  const sentinelRef: RefCallback<HTMLElement> = useCallback((node) => {
    setSentinelNode(node);
  }, []);

  useEffect(() => {
    if (!sentinelNode) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && coursesQuery.hasNextPage && !coursesQuery.isFetchingNextPage) {
        fetchNextPageRef.current();
      }
    });
    observer.observe(sentinelNode);
    return () => observer.disconnect();
  }, [sentinelNode, coursesQuery.hasNextPage, coursesQuery.isFetchingNextPage]);

  return {
    courses,
    isLoading: coursesQuery.isLoading,
    error: coursesQuery.error instanceof Error ? coursesQuery.error.message : null,
    hasNextPage: coursesQuery.hasNextPage,
    fetchNextPage,
    isFetchingNextPage: coursesQuery.isFetchingNextPage,
    totalCount,
    refetch,
    sentinelRef,
  };
}
