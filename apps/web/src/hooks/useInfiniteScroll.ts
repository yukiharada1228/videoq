import { useEffect, useState, type RefCallback } from 'react';

interface InfiniteScrollQuery {
  hasNextPage: boolean;
  isFetching: boolean;
  isFetchNextPageError: boolean;
  fetchNextPage: (options: { cancelRefetch: boolean }) => Promise<unknown>;
}

export function useInfiniteScroll({
  hasNextPage,
  isFetching,
  isFetchNextPageError,
  fetchNextPage,
}: InfiniteScrollQuery): RefCallback<HTMLElement> {
  const [sentinelNode, setSentinelNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!sentinelNode) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasNextPage && !isFetching && !isFetchNextPageError) {
        void fetchNextPage({ cancelRefetch: false });
      }
    });
    observer.observe(sentinelNode);
    return () => observer.disconnect();
  }, [sentinelNode, hasNextPage, isFetching, isFetchNextPageError, fetchNextPage]);

  return setSentinelNode;
}
