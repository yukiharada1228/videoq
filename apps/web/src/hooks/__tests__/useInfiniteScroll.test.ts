import { act, renderHook, waitFor } from '@testing-library/react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useInfiniteScroll } from '../useInfiniteScroll';

it('loads the next visible page after a background refresh finishes', async () => {
  let finishRefresh!: (page: number) => void;
  const fetchPage = vi.fn()
    .mockImplementationOnce(() => new Promise<number>(resolve => { finishRefresh = resolve; }))
    .mockResolvedValue(1);
  const { result } = renderHook(() => {
    const query = useInfiniteQuery({
      queryKey: ['infinite-scroll-background-refresh'],
      queryFn: fetchPage,
      initialPageParam: 0,
      initialData: { pages: [0], pageParams: [0] },
      getNextPageParam: (lastPage: number) => lastPage === 0 ? 1 : undefined,
    });
    return { query, sentinelRef: useInfiniteScroll(query) };
  });
  await waitFor(() => expect(finishRefresh).toBeDefined());
  act(() => { result.current.sentinelRef(document.createElement('div')); });
  await act(async () => { finishRefresh(0); });
  await waitFor(() => expect(result.current.query.data?.pages).toEqual([0, 1]));
  expect(fetchPage).toHaveBeenCalledTimes(2);
});

it('keeps one page request in flight and stops automatic retries after failure', async () => {
  let onIntersection!: IntersectionObserverCallback;
  const observer = { observe: vi.fn(), disconnect: vi.fn(), unobserve: vi.fn() };
  vi.stubGlobal('IntersectionObserver', vi.fn((callback: IntersectionObserverCallback) => {
    onIntersection = callback;
    return observer;
  }));
  let rejectPage!: (error: Error) => void;
  const fetchPage = vi.fn(() => new Promise<number>(
    (_resolve, reject) => { rejectPage = reject; },
  ));
  const { result, unmount } = renderHook(() => {
    const query = useInfiniteQuery({
      queryKey: ['infinite-scroll-regression'],
      queryFn: fetchPage,
      initialPageParam: 0,
      initialData: { pages: [0], pageParams: [0] },
      staleTime: Infinity,
      getNextPageParam: () => 1,
    });
    return { query, sentinelRef: useInfiniteScroll(query) };
  });
  const enterViewport = () => onIntersection(
    [{ isIntersecting: true } as IntersectionObserverEntry],
    observer as unknown as IntersectionObserver,
  );
  try {
    act(() => { result.current.sentinelRef(document.createElement('div')); });
    act(() => {
      enterViewport();
      enterViewport();
    });
    await waitFor(() => expect(result.current.query.isFetchingNextPage).toBe(true));
    expect(fetchPage).toHaveBeenCalledTimes(1);

    await act(async () => { rejectPage(new Error('Page unavailable')); });
    await waitFor(() => expect(result.current.query.isFetchNextPageError).toBe(true));
    act(enterViewport);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(result.current.query.data?.pages).toEqual([0]);
  } finally {
    unmount();
    vi.unstubAllGlobals();
  }
});
