import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryObserver, type QueryKey } from '@tanstack/react-query';
import {
  invalidateAfterChatAnswer,
  invalidateAfterCourseRemoval,
  invalidateAfterCourseUpdate,
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
  const videoCounts = trpc.videos.statusCounts.queryKey();
  const otherVideo = trpc.videos.get.queryKey({ id: 7 });
  const coursePages = trpc.courses.list.infiniteQueryKey({ limit: 24 });
  const courseDetail = trpc.courses.get.queryKey({ id: 1 });
  const tags = trpc.tags.list.queryKey();
  const allKeys: QueryKey[] = [
    videoList, videoPages, videoCounts, videoDetail, otherVideo, coursePages, courseDetail, tags,
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
    expectInvalidated([videoList, videoPages, videoCounts]);
  });

  it('removes only the deleted detail and invalidates video and course queries', async () => {
    await invalidateAfterVideoDelete(queryClient, 42);
    expect(queryClient.getQueryState(videoDetail)).toBeUndefined();
    expect(queryClient.getQueryState(otherVideo)?.isInvalidated).toBe(false);
    for (const key of [videoList, videoPages, videoCounts, coursePages, courseDetail, tags]) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });

  it.each(['upload', 'delete', 'chat'] as const)('refreshes usage on the next visit after %s without an immediate request', async operation => {
    const key = trpc.account.me.queryKey();
    const before = { used_storage_bytes: 4096, video_count: 2, monthly_ai_answers_used: 0 };
    const after = operation === 'upload'
      ? { used_storage_bytes: 8192, video_count: 3 }
      : operation === 'delete'
        ? { used_storage_bytes: 0, video_count: 1 }
        : { ...before, monthly_ai_answers_used: 1 };
    const queryFn = vi.fn(async () => after);
    const options = { queryKey: key, queryFn, staleTime: 60_000 };
    queryClient.setQueryData(key, before);
    const authObserver = new QueryObserver(queryClient, options);
    const unsubscribeAuth = authObserver.subscribe(() => {});
    try {
      if (operation === 'upload') await invalidateAfterVideoUpload(queryClient);
      else if (operation === 'delete') await invalidateAfterVideoDelete(queryClient, 42);
      else await invalidateAfterChatAnswer(queryClient, 1);
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

  it.each(['upload', 'delete', 'chat'] as const)('keeps usage stale when a pre-%s account refresh finishes later', async operation => {
    const key = trpc.account.me.queryKey();
    const before = { used_storage_bytes: 0, monthly_ai_answers_used: 0 };
    const after = { used_storage_bytes: 4096, monthly_ai_answers_used: 1 };
    let finishOldRead!: (data: typeof before) => void;
    const queryFn = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { finishOldRead = resolve; }))
      .mockResolvedValue(after);
    const options = { queryKey: key, queryFn, staleTime: 60_000 };
    queryClient.setQueryData(key, before);
    const observer = new QueryObserver(queryClient, options);
    const unsubscribe = observer.subscribe(() => {});
    try {
      const reading = observer.refetch();
      await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));
      if (operation === 'upload') await invalidateAfterVideoUpload(queryClient);
      else if (operation === 'delete') await invalidateAfterVideoDelete(queryClient, 42);
      else await invalidateAfterChatAnswer(queryClient, 1);
      finishOldRead(before);
      await reading;
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
      expect(queryFn).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
    const home = new QueryObserver(queryClient, options);
    const unsubscribeHome = home.subscribe(() => {});
    try {
      await vi.waitFor(() => expect(queryClient.getQueryData(key)).toEqual(after));
      expect(queryFn).toHaveBeenCalledTimes(2);
    } finally {
      unsubscribeHome();
    }
  });

  it('resumes an initial account load after a usage change without leaving authentication pending', async () => {
    const key = trpc.account.me.queryKey();
    let finishOldRead!: (data: { monthly_ai_answers_used: number }) => void;
    const queryFn = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { finishOldRead = resolve; }))
      .mockResolvedValue({ monthly_ai_answers_used: 1 });
    const observer = new QueryObserver(queryClient, { queryKey: key, queryFn, staleTime: 60_000 });
    const unsubscribe = observer.subscribe(() => {});
    try {
      await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));
      const saving = invalidateAfterChatAnswer(queryClient);
      finishOldRead({ monthly_ai_answers_used: 0 });
      await saving;
      expect(queryClient.getQueryData(key)).toEqual({ monthly_ai_answers_used: 1 });
      expect(observer.getCurrentResult().isPending).toBe(false);
      expect(queryFn).toHaveBeenCalledTimes(2);
    } finally {
      unsubscribe();
    }
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

  it.each([
    { operation: 'upload', key: videoList, save: (client: QueryClient) => invalidateAfterVideoUpload(client) },
    { operation: 'tagged upload', key: tags, save: (client: QueryClient) => invalidateAfterVideoUpload(client, { tagsChanged: true }) },
    { operation: 'video deletion', key: videoPages, save: (client: QueryClient) => invalidateAfterVideoDelete(client, 42) },
    { operation: 'course video deletion', key: courseDetail, save: (client: QueryClient) => invalidateAfterVideoDelete(client, 42) },
    { operation: 'video update', key: videoDetail, save: (client: QueryClient) => invalidateAfterVideoUpdate(client, 42) },
    { operation: 'video tag update', key: tags, save: (client: QueryClient) => invalidateAfterVideoUpdate(client, 42, { metadataChanged: false, tagsChanged: true }) },
    { operation: 'course update', key: courseDetail, save: (client: QueryClient) => invalidateAfterCourseUpdate(client, 1) },
    { operation: 'course removal', key: coursePages, save: (client: QueryClient) => invalidateAfterCourseRemoval(client, 1) },
  ])('replaces a first read started before $operation instead of retaining its old snapshot', async ({ key, save }) => {
    queryClient.removeQueries({ queryKey: key, exact: true });
    let finishOldRead!: (data: { saved: boolean }) => void;
    const queryFn = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { finishOldRead = resolve; }))
      .mockResolvedValue({ saved: true });
    const observer = new QueryObserver(queryClient, { queryKey: key, queryFn, staleTime: Infinity });
    const unsubscribe = observer.subscribe(() => {});
    try {
      await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1));
      const saving = save(queryClient);
      // The obsolete response can arrive even when transport cancellation is ignored.
      finishOldRead({ saved: false });
      await saving;
      expect(queryClient.getQueryData(key)).toEqual({ saved: true });
      expect(queryFn).toHaveBeenCalledTimes(2);
    } finally {
      unsubscribe();
    }
  });
});
