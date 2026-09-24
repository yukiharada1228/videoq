import { act, renderHook, waitFor } from '@testing-library/react';
import { useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import type { Video } from '@videoq/trpc';
import { TRPC_MAX_BATCH_SIZE } from '@videoq/trpc/schema';
import { trpc } from '@/lib/trpc';
import { useVideoEditing } from '../useVideoEditing';
import { useTags } from '../useTags';
import { useAddVideosToCourseMutation, useVideoCourseDetailMutations } from '../useVideoCourseDetailData';

function seedCache(client: QueryClient, keys: QueryKey[]) {
  for (const key of keys) client.setQueryData(key, { cached: true });
}

describe('mutation cache updates', () => {
  it.each(['add', 'remove'] as const)('updates course counts in both list caches after a video %s', async (operation) => {
    const add = vi.fn(() => ({ added_count: 1 }));
    const remove = vi.fn(() => ({ message: 'Removed' }));
    globalThis.__setTrpcHandler('memberships.addVideos', add);
    globalThis.__setTrpcHandler('memberships.removeVideo', remove);
    const { result } = renderHook(() => ({
      client: useQueryClient(),
      add: useAddVideosToCourseMutation(7),
      mutations: useVideoCourseDetailMutations({ courseId: 7, onDeleteSuccess: vi.fn() }),
    }));
    const keys = [
      trpc.courses.get.queryKey({ id: 7 }),
      trpc.courses.list.queryKey({ limit: 5 }),
      trpc.courses.list.infiniteQueryKey({ limit: 24 }),
    ];
    const otherCourse = trpc.courses.get.queryKey({ id: 8 });
    seedCache(result.current.client, [...keys, otherCourse]);

    await act(async () => {
      if (operation === 'add') await result.current.add.mutateAsync([12]);
      else await result.current.mutations.removeVideoMutation.mutateAsync(12);
    });

    for (const key of keys) expect(result.current.client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(result.current.client.getQueryState(otherCourse)?.isInvalidated).toBe(false);
    if (operation === 'add') expect(add).toHaveBeenCalledExactlyOnceWith({ courseId: 7, videoIds: [12] });
    else expect(remove).toHaveBeenCalledExactlyOnceWith({ courseId: 7, videoId: 12 });
  });

  it.each([false, true])('skips unchanged video metadata when saving (tags changed: %s)', async (tagsChanged) => {
    const video: Video = {
      id: 7, title: 'Before', description: null, file: null,
      source_type: 'uploaded', uploaded_at: '2026-09-07T00:00:00Z',
      status: 'completed', tags: [],
    };
    const update = vi.fn(() => video);
    const add = vi.fn(() => ({ message: 'Added' }));
    globalThis.__setTrpcHandler('videos.update', update);
    globalThis.__setTrpcHandler('memberships.addTags', add);
    const { result } = renderHook(() => ({
      client: useQueryClient(),
      editor: useVideoEditing({ video, videoId: video.id }),
    }));
    const key = trpc.videos.get.queryKey({ id: video.id });
    const tagsKey = trpc.tags.list.queryKey();
    const courseKey = trpc.courses.get.queryKey({ id: 2 });
    result.current.client.setQueryData(key, video);
    seedCache(result.current.client, [tagsKey, courseKey]);

    act(() => {
      result.current.editor.startEditing();
      if (tagsChanged) result.current.editor.setEditedTagIds([4]);
    });
    await act(() => result.current.editor.updateMutation.mutateAsync());

    expect(update).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledTimes(tagsChanged ? 1 : 0);
    expect(result.current.client.getQueryState(key)?.isInvalidated).toBe(tagsChanged);
    expect(result.current.client.getQueryState(tagsKey)?.isInvalidated).toBe(tagsChanged);
    expect(result.current.client.getQueryState(courseKey)?.isInvalidated).toBe(false);
    expect(result.current.editor.isEditing).toBe(false);
  });

  it('refreshes partially saved edits so retry only sends the remaining changes', async () => {
    let video: Video = {
      id: 7, title: 'Before', description: '', file: null,
      source_type: 'uploaded', uploaded_at: '2026-09-07T00:00:00Z',
      status: 'completed',
      tags: [1, 2, 3].map(id => ({ id, name: `Tag ${id}`, color: 'blue' })),
    };
    const get = vi.fn(() => video);
    const update = vi.fn(() => (video = { ...video, title: 'After' }));
    const add = vi.fn(() => {
      video = { ...video, tags: [...video.tags!, { id: 4, name: 'Tag 4', color: 'blue' }] };
      return { message: 'Added' };
    });
    let fail = true;
    const remove = vi.fn((input: unknown) => {
      const { tagId } = input as { tagId: number };
      if (tagId === 3 && fail) throw new Error('Tag removal failed');
      if (!video.tags!.some(tag => tag.id === tagId)) throw new Error('Already removed');
      video = { ...video, tags: video.tags!.filter(tag => tag.id !== tagId) };
      return { message: 'Removed' };
    });
    globalThis.__setTrpcHandler('videos.get', get);
    globalThis.__setTrpcHandler('videos.update', update);
    globalThis.__setTrpcHandler('memberships.addTags', add);
    globalThis.__setTrpcHandler('memberships.removeTag', remove);
    const { result } = renderHook(() => {
      const query = useQuery(trpc.videos.get.queryOptions({ id: 7 }));
      return {
        video: query.data,
        editor: useVideoEditing({ video: query.data ?? null, videoId: 7 }),
      };
    });
    await waitFor(() => expect(result.current.video?.title).toBe('Before'));
    act(() => {
      result.current.editor.startEditing();
      result.current.editor.setEditedTitle('After');
      result.current.editor.setEditedTagIds([2, 4]);
    });
    await act(async () => {
      await expect(result.current.editor.updateMutation.mutateAsync()).rejects.toThrow('Tag removal failed');
    });
    await waitFor(() => expect(result.current.video?.tags?.map(tag => tag.id)).toEqual([2, 3, 4]));
    expect(result.current.editor.isEditing).toBe(true);
    expect(result.current.editor.editedTagIds).toEqual([2, 4]);

    fail = false;
    await act(() => result.current.editor.updateMutation.mutateAsync());
    expect(result.current.video?.tags?.map(tag => tag.id)).toEqual([2, 4]);
    expect(result.current.editor.isEditing).toBe(false);
    expect(update).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(1);
    expect(remove.mock.calls.map(([input]) => input)).toEqual([
      { videoId: 7, tagId: 1 }, { videoId: 7, tagId: 3 }, { videoId: 7, tagId: 3 },
    ]);
  });

  it('keeps saving until all HTTP batches finish even if an earlier removal fails', async () => {
    const lastTagId = TRPC_MAX_BATCH_SIZE + 1;
    const video: Video = {
      id: 7, title: 'Before', description: '', file: null,
      source_type: 'uploaded', uploaded_at: '2026-09-07T00:00:00Z',
      status: 'completed',
      tags: Array.from({ length: lastTagId }, (_, index) => ({
        id: index + 1, name: `Tag ${index + 1}`, color: 'blue',
      })),
    };
    let finishLastRemoval!: () => void;
    const remove = vi.fn(async (input: unknown) => {
      const { tagId } = input as { tagId: number };
      if (tagId === 1) throw new Error('First batch failed');
      if (tagId === lastTagId) {
        await new Promise<void>(resolve => { finishLastRemoval = resolve; });
      }
      return { message: 'Removed' };
    });
    globalThis.__setTrpcHandler('memberships.removeTag', remove);
    const { result } = renderHook(() => ({
      client: useQueryClient(),
      editor: useVideoEditing({ video, videoId: video.id }),
    }));
    const key = trpc.videos.get.queryKey({ id: video.id });
    result.current.client.setQueryData(key, video);
    act(() => {
      result.current.editor.startEditing();
      result.current.editor.setEditedTagIds([]);
    });
    let save!: Promise<unknown>;
    act(() => { save = result.current.editor.updateMutation.mutateAsync().catch(error => error); });
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(lastTagId));
    expect(result.current.editor.updateMutation.isPending).toBe(true);
    expect(result.current.client.getQueryState(key)?.isInvalidated).toBe(false);

    await act(async () => {
      finishLastRemoval();
      await save;
    });
    await waitFor(() => expect(result.current.editor.updateMutation.error?.message).toBe('First batch failed'));
    expect(result.current.client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(result.current.editor.isEditing).toBe(true);
  });

  it('uses saved video detail and marks both list formats stale after saving an edit', async () => {
    const video: Video = {
      id: 7, title: 'Before', description: '', file: null,
      source_type: 'uploaded', uploaded_at: '2026-09-07T00:00:00Z',
      status: 'completed', tags: [],
    };
    const update = vi.fn(() => ({ ...video, title: 'After' }));
    globalThis.__setTrpcHandler('videos.update', update);
    const { result } = renderHook(() => ({
      client: useQueryClient(),
      editor: useVideoEditing({ video, videoId: video.id }),
    }));
    const keys = [
      trpc.videos.get.queryKey({ id: video.id }),
      trpc.videos.list.queryKey({ limit: 24 }),
      trpc.videos.list.infiniteQueryKey({ limit: 24 }),
      trpc.courses.get.queryKey({ id: 2 }),
    ];
    const otherVideo = trpc.videos.get.queryKey({ id: 8 });
    const courseList = trpc.courses.list.infiniteQueryKey({ limit: 24 });
    seedCache(result.current.client, [...keys, otherVideo, courseList]);

    act(() => {
      result.current.editor.startEditing();
      result.current.editor.setEditedTitle('After');
    });
    await act(() => result.current.editor.updateMutation.mutateAsync());

    expect(update).toHaveBeenCalledWith({ id: video.id, title: 'After' });
    expect(result.current.client.getQueryData(keys[0])).toEqual({ ...video, title: 'After' });
    expect(result.current.client.getQueryState(keys[0])?.isInvalidated).toBe(false);
    for (const key of keys.slice(1)) {
      expect(result.current.client.getQueryState(key)?.isInvalidated).toBe(true);
    }
    expect(result.current.client.getQueryState(otherVideo)?.isInvalidated).toBe(false);
    expect(result.current.client.getQueryState(courseList)?.isInvalidated).toBe(false);
  });

  it.each([false, true])('refreshes tag counts after membership edits, including partial saves (%s)', async failRemoval => {
    const tags = [1, 2, 3].map(id => ({
      id, name: `Tag ${id}`, color: 'blue', created_at: '2026-09-23T00:00:00Z', video_count: id === 3 ? 0 : 1,
    }));
    const listTags = vi.fn(() => ({ data: tags, meta: { total: 3, limit: 100, offset: 0 } }));
    globalThis.__setTrpcHandler('tags.list', listTags);
    globalThis.__setTrpcHandler('memberships.addTags', () => {
      tags[2] = { ...tags[2], video_count: 1 };
      return { message: 'Added', added_count: 1, skipped_count: 0 };
    });
    globalThis.__setTrpcHandler('memberships.removeTag', () => {
      if (failRemoval) throw new Error('Removal failed');
      tags[0] = { ...tags[0], video_count: 0 };
      return { message: 'Removed' };
    });
    const video: Video = {
      id: 7, title: 'Video', description: '', file: null,
      source_type: 'uploaded', uploaded_at: '2026-09-23T00:00:00Z', status: 'completed',
      tags: tags.slice(0, 2),
    };
    const { result } = renderHook(() => ({
      editor: useVideoEditing({ video, videoId: video.id }),
      tags: useTags(),
    }));
    await waitFor(() => expect(result.current.tags.tags.map(tag => tag.video_count)).toEqual([1, 1, 0]));
    act(() => {
      result.current.editor.startEditing();
      result.current.editor.setEditedTagIds([2, 3]);
    });

    await act(async () => {
      const save = result.current.editor.updateMutation.mutateAsync();
      if (failRemoval) await expect(save).rejects.toThrow('Removal failed');
      else await save;
    });

    await waitFor(() => expect(result.current.tags.tags.map(tag => tag.video_count))
      .toEqual([failRemoval ? 1 : 0, 1, 1]));
    expect(listTags).toHaveBeenCalledTimes(2);
  });

  it('uses the saved course detail and refreshes both list formats after saving metadata', async () => {
    const saved = { id: 7, name: 'After', description: '' };
    const update = vi.fn(() => saved);
    globalThis.__setTrpcHandler('courses.update', update);
    const { result } = renderHook(() => ({
      client: useQueryClient(),
      mutations: useVideoCourseDetailMutations({ courseId: 7, onDeleteSuccess: vi.fn() }),
    }));
    const keys = [
      trpc.courses.get.queryKey({ id: 7 }),
      trpc.courses.list.queryKey({ limit: 24 }),
      trpc.courses.list.infiniteQueryKey({ limit: 24 }),
    ];
    seedCache(result.current.client, keys);

    await act(async () => {
      await result.current.mutations.updateCourseMutation.mutateAsync({ name: 'After', description: '' });
    });

    expect(update).toHaveBeenCalledWith({ id: 7, name: 'After', description: '' });
    expect(result.current.client.getQueryData(keys[0])).toEqual(saved);
    expect(result.current.client.getQueryState(keys[0])?.isInvalidated).toBe(false);
    for (const key of keys.slice(1)) {
      expect(result.current.client.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });

  it.each([false, true])('waits for every tag change and retains edits on failure (%s)', async (fail) => {
    const video: Video = {
      id: 7, title: 'Before', description: '', file: null,
      source_type: 'uploaded', uploaded_at: '2026-09-07T00:00:00Z',
      status: 'completed',
      tags: [1, 2, 3].map(id => ({ id, name: `Tag ${id}`, color: 'blue' })),
    };
    let finishRemoval!: () => void;
    const update = vi.fn(() => video);
    const add = vi.fn(() => ({ message: 'Added' }));
    const remove = vi.fn(async (input: unknown) => {
      if ((input as { tagId: number }).tagId === 3) {
        await new Promise<void>((resolve, reject) => {
          finishRemoval = () => fail ? reject(new Error('Tag removal failed')) : resolve();
        });
      }
      return { message: 'Removed' };
    });
    globalThis.__setTrpcHandler('videos.update', update);
    globalThis.__setTrpcHandler('memberships.addTags', add);
    globalThis.__setTrpcHandler('memberships.removeTag', remove);
    const { result } = renderHook(() => useVideoEditing({ video, videoId: video.id }));
    act(() => {
      result.current.startEditing();
      result.current.setEditedTitle('After');
      result.current.setEditedTagIds([2, 4]);
    });

    let save!: Promise<unknown>;
    act(() => {
      save = result.current.updateMutation.mutateAsync().catch(error => error);
    });
    await waitFor(() => expect(finishRemoval).toBeDefined());
    expect(result.current.updateMutation.isPending).toBe(true);
    expect(result.current.isEditing).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledExactlyOnceWith({ videoId: 7, tagIds: [4] });
    expect(remove.mock.calls.map(([input]) => input)).toEqual([
      { videoId: 7, tagId: 1 }, { videoId: 7, tagId: 3 },
    ]);

    await act(async () => {
      finishRemoval();
      await save;
    });
    await waitFor(() => expect(result.current.updateMutation.isPending).toBe(false));
    expect(result.current.isEditing).toBe(fail);
    if (fail) {
      expect(result.current.updateMutation.error?.message).toBe('Tag removal failed');
      expect(result.current.editedTitle).toBe('After');
      expect(result.current.editedTagIds).toEqual([2, 4]);
    }
  });
});
