import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryObserver, type QueryKey } from '@tanstack/react-query';
import {
  invalidateAfterVideoDelete,
  invalidateAfterVideoUpdate,
  invalidateAfterVideoUpload,
} from '../cacheInvalidation';
import { trpc } from '../trpc';

describe('tRPC cache invalidation', () => {
  let queryClient: QueryClient;
  const videoList = trpc.videos.list.queryKey({ limit: 24 });
  const videoPages = trpc.videos.list.infiniteQueryKey({ limit: 24 });
  const videoDetail = trpc.videos.get.queryKey({ id: 42 });
  const otherVideo = trpc.videos.get.queryKey({ id: 7 });
  const coursePages = trpc.courses.list.infiniteQueryKey({ limit: 24 });
  const courseDetail = trpc.courses.get.queryKey({ id: 1 });
  const tags = trpc.tags.list.queryKey();
  const allKeys: QueryKey[] = [
    videoList, videoPages, videoDetail, otherVideo, coursePages, courseDetail, tags,
  ];

  beforeEach(() => {
    queryClient = new QueryClient();
    // These tests exercise cache selection without fetching application data.
    for (const key of allKeys) queryClient.setQueryData(key, { cached: true });
  });

  afterEach(() => queryClient.clear());

  function expectInvalidated(keys: QueryKey[]) {
    for (const key of allKeys) {
      expect(queryClient.getQueryState(key)?.isInvalidated, JSON.stringify(key))
        .toBe(keys.includes(key));
    }
  }

  it('invalidates both regular and infinite video queries after upload', async () => {
    await invalidateAfterVideoUpload(queryClient);
    expectInvalidated([videoList, videoPages, videoDetail, otherVideo]);
  });

  it('removes only the deleted detail and invalidates video and course queries', async () => {
    await invalidateAfterVideoDelete(queryClient, 42);
    expect(queryClient.getQueryState(videoDetail)).toBeUndefined();
    for (const key of [videoList, videoPages, otherVideo, coursePages, courseDetail, tags]) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });

  it.each(['upload', 'delete'] as const)('refreshes usage on the next visit after %s without an immediate request', async operation => {
    const key = trpc.account.me.queryKey();
    const before = { used_storage_bytes: 4096, video_count: 2 };
    const after = operation === 'upload'
      ? { used_storage_bytes: 8192, video_count: 3 }
      : { used_storage_bytes: 0, video_count: 1 };
    const queryFn = vi.fn(async () => after);
    const options = { queryKey: key, queryFn, staleTime: 60_000 };
    queryClient.setQueryData(key, before);
    const authObserver = new QueryObserver(queryClient, options);
    const unsubscribeAuth = authObserver.subscribe(() => {});
    try {
      if (operation === 'upload') await invalidateAfterVideoUpload(queryClient);
      else await invalidateAfterVideoDelete(queryClient, 42);
      expect(queryFn).not.toHaveBeenCalled();
      expect(queryClient.getQueryData(key)).toEqual(before);
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    } finally {
      unsubscribeAuth();
    }

    const homeObserver = new QueryObserver(queryClient, options);
    const unsubscribeHome = homeObserver.subscribe(() => {});
    try {
      await vi.waitFor(() => expect(queryClient.getQueryData(key)).toEqual(after));
      expect(queryFn).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribeHome();
    }
  });

  it('retains detail data and invalidates video and course queries after update', async () => {
    await invalidateAfterVideoUpdate(queryClient, 42);
    expect(queryClient.getQueryData(videoDetail)).toEqual({ cached: true });
    expectInvalidated([videoList, videoPages, videoDetail, courseDetail]);
  });

  it('refetches each active query only once after an update', async () => {
    const queryFn = vi.fn(async () => ({ cached: true }));
    const observer = new QueryObserver(queryClient, {
      queryKey: videoDetail,
      queryFn,
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => {});
    try {
      await invalidateAfterVideoUpdate(queryClient, 42);
      expect(queryFn).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });
});
