import { act, renderHook, waitFor } from '@testing-library/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Course } from '@videoq/trpc';
import { trpc } from '@/lib/trpc';
import { useVideoCourseDetailMutations } from '../useVideoCourseDetailData';

const course: Course = {
  id: 7, name: 'Before', description: 'Description', display_order: 0,
  created_at: '2026-09-23T00:00:00Z', updated_at: '2026-09-23T00:00:00Z',
  video_count: 0, videos: [], access_role: 'owner', share_slug: 'shared-course',
};
const saved: Course = {
  ...course, name: 'Saved name', updated_at: '2026-09-23T01:00:00Z',
  video_count: 1, videos: [{
    id: 12, title: 'Video', status: 'completed', file: 'fresh-url.mp4',
    uploaded_at: '2026-09-23T00:00:00Z', order: 0,
  }],
};
const key = trpc.courses.get.queryKey({ id: course.id });

function useEditor(onUpdateSuccess?: () => void) {
  const query = useQuery(trpc.courses.get.queryOptions({ id: course.id }, {
    initialData: course, staleTime: Infinity,
  }));
  return {
    query, client: useQueryClient(),
    editor: useVideoCourseDetailMutations({ courseId: course.id, onDeleteSuccess: vi.fn(), onUpdateSuccess }),
  };
}

describe('course metadata saves', () => {
  it('applies the full server response without fetching the detail again', async () => {
    const get = vi.fn(() => course);
    const update = vi.fn(() => saved);
    const onUpdate = vi.fn();
    globalThis.__setTrpcHandler('courses.get', get);
    globalThis.__setTrpcHandler('courses.update', update);
    const { result } = renderHook(() => useEditor(onUpdate));
    await act(() => result.current.editor.updateCourseMutation.mutateAsync({ name: ' Saved name ', description: course.description }));

    await waitFor(() => expect(result.current.query.data).toEqual(saved));
    expect(update).toHaveBeenCalledExactlyOnceWith({ id: 7, name: ' Saved name ' });
    expect(get).not.toHaveBeenCalled();
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it.each([
    { name: course.name, description: course.description },
    { name: course.name },
    {},
    { name: undefined, description: undefined },
  ])('closes an unchanged save without updating or invalidating any course query (%j)', async payload => {
    const update = vi.fn(() => course);
    const onUpdate = vi.fn();
    globalThis.__setTrpcHandler('courses.update', update);
    const { result } = renderHook(() => useEditor(onUpdate));
    const listKey = trpc.courses.list.infiniteQueryKey({ limit: 24 });
    result.current.client.setQueryData(listKey, { pages: [], pageParams: [] });
    await act(() => result.current.editor.updateCourseMutation.mutateAsync(payload));

    expect(update).not.toHaveBeenCalled();
    expect(result.current.client.getQueryData(key)).toEqual(course);
    expect(result.current.client.getQueryState(key)?.isInvalidated).toBe(false);
    expect(result.current.client.getQueryState(listKey)?.isInvalidated).toBe(false);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('clears the description without resending a name already saved in the latest cache', async () => {
    const current = { ...course, name: 'Updated elsewhere' };
    const update = vi.fn(() => ({ ...current, description: '' }));
    globalThis.__setTrpcHandler('courses.update', update);
    const { result } = renderHook(() => useEditor());
    act(() => { result.current.client.setQueryData(key, current); });
    await act(() => result.current.editor.updateCourseMutation.mutateAsync({ name: current.name, description: '' }));

    expect(update).toHaveBeenCalledExactlyOnceWith({ id: 7, description: '' });
    await waitFor(() => expect(result.current.query.data).toEqual({ ...current, description: '' }));
  });

  it('keeps the saved response when an older detail request finishes later', async () => {
    let finishRead!: (value: Course) => void;
    const get = vi.fn(() => new Promise<Course>(resolve => { finishRead = resolve; }));
    globalThis.__setTrpcHandler('courses.get', get);
    globalThis.__setTrpcHandler('courses.update', () => saved);
    const { result } = renderHook(() => useEditor());
    let read!: Promise<void>;
    act(() => { read = result.current.client.refetchQueries(trpc.courses.get.queryFilter({ id: 7 })); });
    await waitFor(() => expect(finishRead).toBeDefined());
    let save!: Promise<unknown>;
    act(() => { save = result.current.editor.updateCourseMutation.mutateAsync({ name: saved.name, description: saved.description }); });
    await waitFor(() => expect(result.current.client.getQueryData(key)).toEqual(saved));
    await act(async () => { finishRead(course); await read; await save; });

    expect(result.current.query.data).toEqual(saved);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('preserves the cached course on failure and applies a successful retry', async () => {
    const update = vi.fn().mockRejectedValueOnce(new Error('Update failed')).mockResolvedValue(saved);
    const onUpdate = vi.fn();
    globalThis.__setTrpcHandler('courses.update', update);
    const { result } = renderHook(() => useEditor(onUpdate));
    const payload = { name: saved.name, description: saved.description };
    await act(async () => {
      await expect(result.current.editor.updateCourseMutation.mutateAsync(payload)).rejects.toThrow('Update failed');
    });
    expect(result.current.client.getQueryData(key)).toEqual(course);
    expect(result.current.client.getQueryState(key)?.isInvalidated).toBe(false);
    expect(onUpdate).not.toHaveBeenCalled();
    await act(() => result.current.editor.updateCourseMutation.mutateAsync(payload));
    expect(result.current.client.getQueryData(key)).toEqual(saved);
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('writes a delayed save to its original course after the hook changes scope', async () => {
    let finishSave!: (value: Course) => void;
    globalThis.__setTrpcHandler('courses.update', () => new Promise<Course>(resolve => { finishSave = resolve; }));
    const { result, rerender } = renderHook(({ courseId }) => ({
      client: useQueryClient(),
      editor: useVideoCourseDetailMutations({ courseId, onDeleteSuccess: vi.fn() }),
    }), { initialProps: { courseId: 7 } });
    const otherKey = trpc.courses.get.queryKey({ id: 8 });
    const other = { ...course, id: 8, name: 'Other' };
    result.current.client.setQueryData(key, course);
    result.current.client.setQueryData(otherKey, other);
    let save!: Promise<unknown>;
    act(() => { save = result.current.editor.updateCourseMutation.mutateAsync({ name: saved.name, description: saved.description }); });
    await waitFor(() => expect(finishSave).toBeDefined());
    rerender({ courseId: 8 });
    await act(async () => { finishSave(saved); await save; });

    expect(result.current.client.getQueryData(key)).toEqual(saved);
    expect(result.current.client.getQueryData(otherKey)).toEqual(other);
    expect(result.current.client.getQueryState(otherKey)?.isInvalidated).toBe(false);
  });

  it('uses the response to populate an absent detail cache', async () => {
    const update = vi.fn(() => saved);
    globalThis.__setTrpcHandler('courses.update', update);
    const { result } = renderHook(() => ({
      client: useQueryClient(),
      editor: useVideoCourseDetailMutations({ courseId: 7, onDeleteSuccess: vi.fn() }),
    }));
    await act(() => result.current.editor.updateCourseMutation.mutateAsync({ name: saved.name, description: saved.description }));
    expect(update).toHaveBeenCalledTimes(1);
    expect(result.current.client.getQueryData(key)).toEqual(saved);
  });
});
