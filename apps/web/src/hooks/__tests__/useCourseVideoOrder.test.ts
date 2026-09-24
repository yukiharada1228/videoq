import { act, renderHook, waitFor } from '@testing-library/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Course } from '@videoq/trpc';
import { trpc } from '@/lib/trpc';
import { useVideoCourseDetailMutations } from '../useVideoCourseDetailData';

const course = {
  id: 7, name: 'Course', description: 'Description', display_order: 0,
  created_at: '2026-09-23T00:00:00Z', updated_at: '2026-09-23T00:00:00Z',
  video_count: 3, access_role: 'owner', share_slug: null,
  videos: [1, 2, 3].map((id) => ({
    id, title: `Video ${id}`, status: 'completed', file: `${id}.mp4`,
    uploaded_at: '2026-09-23T00:00:00Z', order: id * 10,
  })),
} satisfies Course;
const key = trpc.courses.get.queryKey({ id: course.id });
const filter = trpc.courses.get.queryFilter({ id: course.id });
const listKey = trpc.courses.list.infiniteQueryKey({ limit: 24 });
const videoIds = [3, 1, 2];
const reordered = videoIds.map((id, order) => ({ ...course.videos.find((v) => v.id === id)!, order }));

function useEditor() {
  const query = useQuery(trpc.courses.get.queryOptions({ id: course.id }, {
    initialData: course, staleTime: Infinity,
  }));
  return {
    query, client: useQueryClient(),
    editor: useVideoCourseDetailMutations({ courseId: course.id, onDeleteSuccess: vi.fn() }),
  };
}

describe('course video ordering', () => {
  it('updates the order immediately and saves without refetching detail or invalidating lists', async () => {
    let finishSave!: () => void;
    const save = vi.fn(() => new Promise<void>((resolve) => { finishSave = resolve; }));
    const get = vi.fn(() => course);
    globalThis.__setTrpcHandler('memberships.reorderVideos', save);
    globalThis.__setTrpcHandler('courses.get', get);
    const { result } = renderHook(useEditor);
    result.current.client.setQueryData(listKey, { pages: [], pageParams: [] });
    let pending!: Promise<void>;
    act(() => { pending = result.current.editor.reorderVideosMutation.mutateAsync(videoIds); });
    await waitFor(() => expect(finishSave).toBeDefined());
    expect(result.current.client.getQueryData(key)).toEqual({ ...course, videos: reordered });
    expect(result.current.editor.reorderVideosMutation.isPending).toBe(true);
    await act(async () => { finishSave(); await pending; });
    expect(save).toHaveBeenCalledExactlyOnceWith({ courseId: 7, videoIds });
    expect(get).not.toHaveBeenCalled();
    expect(result.current.client.getQueryState(listKey)?.isInvalidated).toBe(false);
  });

  it('keeps the new order when an older detail request finishes after saving', async () => {
    let finishRead!: (value: Course) => void;
    const get = vi.fn(() => new Promise<Course>((resolve) => { finishRead = resolve; }));
    globalThis.__setTrpcHandler('courses.get', get);
    globalThis.__setTrpcHandler('memberships.reorderVideos', () => undefined);
    const { result } = renderHook(useEditor);
    let read!: Promise<void>;
    act(() => { read = result.current.client.refetchQueries(filter); });
    await waitFor(() => expect(finishRead).toBeDefined());
    await act(() => result.current.editor.reorderVideosMutation.mutateAsync(videoIds));
    await act(async () => { finishRead(course); await read; });
    expect(result.current.client.getQueryData(key)).toEqual({ ...course, videos: reordered });
    await waitFor(() => expect(result.current.query.data).toEqual({ ...course, videos: reordered }));
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('restores the previous order on failure and refreshes only the affected detail before allowing a retry', async () => {
    let failSave!: (error: Error) => void;
    let finishRead!: (value: Course) => void;
    globalThis.__setTrpcHandler('memberships.reorderVideos', () => new Promise<void>((_, reject) => { failSave = reject; }));
    const get = vi.fn(() => new Promise<Course>((resolve) => { finishRead = resolve; }));
    globalThis.__setTrpcHandler('courses.get', get);
    const { result } = renderHook(useEditor);
    result.current.client.setQueryData(listKey, { pages: [], pageParams: [] });
    let failure!: Promise<unknown>;
    act(() => { failure = result.current.editor.reorderVideosMutation.mutateAsync(videoIds).catch((error: unknown) => error); });
    await waitFor(() => expect(failSave).toBeDefined());
    // A separate metadata update must survive rollback.
    act(() => { result.current.client.setQueryData(key, (current) => current && { ...current, share_slug: 'new-share' }); });
    act(() => { failSave(new Error('Order failed')); });
    await waitFor(() => expect(finishRead).toBeDefined());
    expect(result.current.client.getQueryData(key)).toEqual({ ...course, share_slug: 'new-share' });
    expect(result.current.editor.reorderVideosMutation.isPending).toBe(true);
    const refreshed = { ...course, name: 'Latest', videos: course.videos.slice(1), video_count: 2 };
    await act(async () => { finishRead(refreshed); await failure; });
    expect(await failure).toMatchObject({ message: 'Order failed' });
    await waitFor(() => expect(result.current.query.data).toEqual(refreshed));
    expect(result.current.client.getQueryState(listKey)?.isInvalidated).toBe(false);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('does not leave the failed optimistic order visible when refreshing also fails', async () => {
    globalThis.__setTrpcHandler('memberships.reorderVideos', () => { throw new Error('Order failed'); });
    const get = vi.fn(() => { throw new Error('Read failed'); });
    globalThis.__setTrpcHandler('courses.get', get);
    const { result } = renderHook(useEditor);
    await act(async () => {
      await expect(result.current.editor.reorderVideosMutation.mutateAsync(videoIds)).rejects.toThrow('Order failed');
    });
    expect(get).toHaveBeenCalledTimes(1);
    expect(result.current.client.getQueryData(key)).toEqual(course);
  });

  it('does not drop newly added videos from a cache that differs from the submitted membership', async () => {
    let failSave!: (error: Error) => void;
    globalThis.__setTrpcHandler('memberships.reorderVideos', () => new Promise<void>((_, reject) => { failSave = reject; }));
    const { result } = renderHook(useEditor);
    const newer = { ...course, videos: [...course.videos, { ...course.videos[0], id: 4 }], video_count: 4 };
    globalThis.__setTrpcHandler('courses.get', () => newer);
    act(() => { result.current.client.setQueryData(key, newer); });
    let failure!: Promise<unknown>;
    act(() => { failure = result.current.editor.reorderVideosMutation.mutateAsync(videoIds).catch((error: unknown) => error); });
    await waitFor(() => expect(failSave).toBeDefined());
    expect(result.current.client.getQueryData(key)).toEqual(newer);
    await act(async () => { failSave(new Error('Membership changed')); await failure; });
    expect(result.current.query.data).toEqual(newer);
  });

  it('invalidates the original course on a delayed failure after changing scope', async () => {
    let failSave!: (error: Error) => void;
    globalThis.__setTrpcHandler('memberships.reorderVideos', () => new Promise<void>((_, reject) => { failSave = reject; }));
    const { result, rerender } = renderHook(({ courseId }) => ({
      client: useQueryClient(),
      editor: useVideoCourseDetailMutations({ courseId, onDeleteSuccess: vi.fn() }),
    }), { initialProps: { courseId: 7 } });
    const otherKey = trpc.courses.get.queryKey({ id: 8 });
    const other = { ...course, id: 8, name: 'Other' };
    result.current.client.setQueryData(key, course);
    result.current.client.setQueryData(otherKey, other);
    let failure!: Promise<unknown>;
    act(() => { failure = result.current.editor.reorderVideosMutation.mutateAsync(videoIds).catch((error: unknown) => error); });
    await waitFor(() => expect(failSave).toBeDefined());
    rerender({ courseId: 8 });
    await act(async () => { failSave(new Error('Order failed')); await failure; });
    expect(result.current.client.getQueryData(key)).toEqual(course);
    expect(result.current.client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(result.current.client.getQueryData(otherKey)).toEqual(other);
    expect(result.current.client.getQueryState(otherKey)?.isInvalidated).toBe(false);
  });

  it('preserves newer membership data when a delayed save fails', async () => {
    let failSave!: (error: Error) => void;
    globalThis.__setTrpcHandler('memberships.reorderVideos', () => new Promise<void>((_, reject) => { failSave = reject; }));
    const { result } = renderHook(() => ({
      client: useQueryClient(),
      editor: useVideoCourseDetailMutations({ courseId: 7, onDeleteSuccess: vi.fn() }),
    }));
    result.current.client.setQueryData(key, course);
    let failure!: Promise<unknown>;
    act(() => { failure = result.current.editor.reorderVideosMutation.mutateAsync(videoIds).catch((error: unknown) => error); });
    await waitFor(() => expect(failSave).toBeDefined());
    const newer = { ...course, videos: [course.videos[1]], video_count: 1 };
    result.current.client.setQueryData(key, newer);
    await act(async () => { failSave(new Error('Order failed')); await failure; });
    expect(result.current.client.getQueryData(key)).toEqual(newer);
    expect(result.current.client.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it('does not create a partial course when detail is not cached', async () => {
    const save = vi.fn(() => undefined);
    globalThis.__setTrpcHandler('memberships.reorderVideos', save);
    const { result } = renderHook(() => ({
      client: useQueryClient(),
      editor: useVideoCourseDetailMutations({ courseId: 7, onDeleteSuccess: vi.fn() }),
    }));
    await act(() => result.current.editor.reorderVideosMutation.mutateAsync(videoIds));
    expect(save).toHaveBeenCalledExactlyOnceWith({ courseId: 7, videoIds });
    expect(result.current.client.getQueryData(key)).toBeUndefined();
  });
});
