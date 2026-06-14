import { useCallback, useEffect, useMemo, useRef, useState, type RefCallback } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient, type VideoGroupList } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/lib/queryKeys';

const PAGE_SIZE = 24;

interface UseVideoGroupsReturn {
  groups: VideoGroupList[];
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
 * Fetch the list of video groups with infinite scroll pagination.
 * Keeps the original public fields while adding page-loading controls.
 */
export function useVideoGroups(trigger: boolean = true): UseVideoGroupsReturn {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const groupsQuery = useInfiniteQuery({
    queryKey: queryKeys.videoGroups.infinite(userId),
    enabled: trigger && userId !== null,
    queryFn: async ({ pageParam }) => (
      apiClient.getVideoGroupsPage({
        limit: PAGE_SIZE,
        offset: pageParam as number,
      })
    ),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.next) return undefined;
      return allPages.reduce((sum, page) => sum + page.results.length, 0);
    },
  });

  const groups = useMemo(
    () => groupsQuery.data?.pages.flatMap((page) => page.results) ?? [],
    [groupsQuery.data],
  );

  const totalCount = groupsQuery.data?.pages[0]?.count ?? 0;

  useEffect(() => {
    if (groupsQuery.error) {
      console.error('Failed to load video groups', groupsQuery.error);
    }
  }, [groupsQuery.error]);

  const refetch = useCallback(async () => {
    if (userId === null || !trigger) {
      return;
    }
    const result = await groupsQuery.refetch();
    if (result.error) {
      throw result.error;
    }
  }, [groupsQuery, trigger, userId]);

  const fetchNextPage = useCallback(() => {
    void groupsQuery.fetchNextPage();
  }, [groupsQuery]);

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
      if (entries[0].isIntersecting && groupsQuery.hasNextPage && !groupsQuery.isFetchingNextPage) {
        fetchNextPageRef.current();
      }
    });
    observer.observe(sentinelNode);
    return () => observer.disconnect();
  }, [sentinelNode, groupsQuery.hasNextPage, groupsQuery.isFetchingNextPage]);

  return {
    groups,
    isLoading: groupsQuery.isLoading,
    error: groupsQuery.error instanceof Error ? groupsQuery.error.message : null,
    hasNextPage: groupsQuery.hasNextPage,
    fetchNextPage,
    isFetchingNextPage: groupsQuery.isFetchingNextPage,
    totalCount,
    refetch,
    sentinelRef,
  };
}
