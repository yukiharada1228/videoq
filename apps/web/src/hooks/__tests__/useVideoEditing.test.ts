import { act, renderHook, waitFor } from '@testing-library/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Video } from '@videoq/trpc';
import { trpc } from '@/lib/trpc';
import { useVideoEditing } from '../useVideoEditing';

const video: Video = {
  id: 7, title: 'Before', description: 'Original description', file: null,
  source_type: 'uploaded', uploaded_at: '2026-09-23T00:00:00Z', status: 'completed',
  tags: [{ id: 1, name: 'Tag 1', color: 'blue' }],
};

describe('video editing drafts and saved data', () => {
  it('keeps untouched metadata and tags current during background updates', async () => {
    const updated = { ...video, title: 'After', description: 'Updated elsewhere', tags: [...video.tags!, { id: 2, name: 'Tag 2', color: 'blue' }] };
    const update = vi.fn(() => updated);
    const add = vi.fn();
    const remove = vi.fn();
    globalThis.__setTrpcHandler('videos.update', update);
    globalThis.__setTrpcHandler('memberships.addTags', add);
    globalThis.__setTrpcHandler('memberships.removeTag', remove);
    const { result, rerender } = renderHook(({ current }) => useVideoEditing({ video: current, videoId: 7 }), { initialProps: { current: video } });
    act(() => result.current.startEditing());
    act(() => result.current.setEditedTitle('After'));
    rerender({ current: { ...updated, title: 'Before' } });

    expect(result.current.editedTitle).toBe('After');
    expect(result.current.editedDescription).toBe('Updated elsewhere');
    expect(result.current.editedTagIds).toEqual([1, 2]);
    await act(() => result.current.updateMutation.mutateAsync());
    expect(update).toHaveBeenCalledExactlyOnceWith({ id: 7, title: 'After' });
    expect(add).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('sends an explicit empty description without overwriting an untouched title', async () => {
    const update = vi.fn(() => ({ ...video, title: 'New title', description: '' }));
    globalThis.__setTrpcHandler('videos.update', update);
    const { result, rerender } = renderHook(({ current }) => useVideoEditing({ video: current, videoId: 7 }), { initialProps: { current: video } });
    act(() => result.current.startEditing());
    act(() => result.current.setEditedDescription(''));
    rerender({ current: { ...video, title: 'New title' } });
    expect(result.current.editedTitle).toBe('New title');
    expect(result.current.editedDescription).toBe('');
    await act(() => result.current.updateMutation.mutateAsync());
    expect(update).toHaveBeenCalledExactlyOnceWith({ id: 7, description: '' });
  });

  it('discards cancelled drafts and composes functional tag selection updates', () => {
    const { result, rerender } = renderHook(({ current }) => useVideoEditing({ video: current, videoId: 7 }), { initialProps: { current: video } });
    act(() => result.current.startEditing());
    act(() => {
      result.current.setEditedTitle('Discarded');
      result.current.setEditedDescription('Discarded');
      result.current.setEditedTagIds([]);
    });
    act(() => result.current.cancelEditing());
    rerender({ current: { ...video, title: 'Latest', tags: [...video.tags!, { id: 2, name: 'Tag 2', color: 'blue' }] } });
    act(() => result.current.startEditing());
    act(() => {
      result.current.setEditedTagIds(previous => [...previous, 3]);
      result.current.setEditedTagIds(previous => [...previous, 4]);
    });
    expect(result.current.editedTitle).toBe('Latest');
    expect(result.current.editedDescription).toBe(video.description);
    expect(result.current.editedTagIds).toEqual([1, 2, 3, 4]);
  });

  it('keeps background tag changes when an earlier tag creation callback completes', () => {
    const { result, rerender } = renderHook(({ current }) => useVideoEditing({ video: current, videoId: 7 }), { initialProps: { current: video } });
    act(() => result.current.startEditing());
    const finishTagCreation = result.current.setEditedTagIds;
    rerender({ current: { ...video, tags: [...video.tags!, { id: 2, name: 'Tag 2', color: 'blue' }] } });
    act(() => finishTagCreation(previous => [...previous, 3]));
    expect(result.current.editedTagIds).toEqual([1, 2, 3]);
  });

  it('uses the complete update response without a second detail request', async () => {
    const saved = { ...video, title: 'Server title', transcript: 'Current subtitle' };
    const get = vi.fn().mockResolvedValueOnce(video).mockRejectedValue(new Error('Unnecessary reload'));
    globalThis.__setTrpcHandler('videos.get', get);
    globalThis.__setTrpcHandler('videos.update', () => saved);
    const { result } = renderHook(() => {
      const query = useQuery(trpc.videos.get.queryOptions({ id: 7 }));
      return { query, editor: useVideoEditing({ video: query.data ?? null, videoId: 7 }) };
    });
    await waitFor(() => expect(result.current.query.data).toEqual(video));
    act(() => result.current.editor.startEditing());
    act(() => result.current.editor.setEditedTitle('Client title'));
    await act(() => result.current.editor.updateMutation.mutateAsync());
    await waitFor(() => expect(result.current.query.data).toEqual(saved));
    expect(get).toHaveBeenCalledTimes(1);
    expect(result.current.editor.isEditing).toBe(false);
  });

  it('prevents an older in-flight detail read from overwriting saved data', async () => {
    const saved = { ...video, title: 'After' };
    let finishRead!: (value: Video) => void;
    globalThis.__setTrpcHandler('videos.update', () => saved);
    const { result } = renderHook(() => ({ client: useQueryClient(), editor: useVideoEditing({ video, videoId: 7 }) }));
    const key = trpc.videos.get.queryKey({ id: 7 });
    result.current.client.setQueryData(key, video);
    const pending = result.current.client.fetchQuery({ queryKey: key, queryFn: () => new Promise<Video>(resolve => { finishRead = resolve; }) }).catch(() => undefined);
    act(() => result.current.editor.startEditing());
    act(() => result.current.editor.setEditedTitle('After'));
    await act(() => result.current.editor.updateMutation.mutateAsync());
    await act(async () => { finishRead(video); await pending; });
    expect(result.current.client.getQueryData(key)).toEqual(saved);
  });

  it('refreshes uncertain writes after errors so retry does not repeat persisted metadata', async () => {
    let persisted = video;
    const get = vi.fn(() => persisted);
    const update = vi.fn(() => {
      persisted = { ...video, title: 'After' };
      throw new Error('Response lost');
    });
    globalThis.__setTrpcHandler('videos.get', get);
    globalThis.__setTrpcHandler('videos.update', update);
    const { result } = renderHook(() => {
      const query = useQuery(trpc.videos.get.queryOptions({ id: 7 }));
      return { query, editor: useVideoEditing({ video: query.data ?? null, videoId: 7 }) };
    });
    await waitFor(() => expect(result.current.query.data).toEqual(video));
    act(() => result.current.editor.startEditing());
    act(() => result.current.editor.setEditedTitle('After'));
    await act(async () => { await expect(result.current.editor.updateMutation.mutateAsync()).rejects.toThrow('Response lost'); });
    await waitFor(() => expect(result.current.query.data?.title).toBe('After'));
    expect(result.current.editor.isEditing).toBe(true);
    await act(() => result.current.editor.updateMutation.mutateAsync());
    expect(update).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(2);
    expect(result.current.editor.isEditing).toBe(false);
  });

  it('retains saved metadata when a tag change and its recovery read both fail', async () => {
    const saved = { ...video, title: 'After' };
    const get = vi.fn().mockResolvedValueOnce(video).mockRejectedValueOnce(new Error('Read failed')).mockResolvedValue({ ...saved, tags: [] });
    const update = vi.fn(() => saved);
    const remove = vi.fn().mockRejectedValueOnce(new Error('Tag failed')).mockResolvedValue({ message: 'Removed' });
    globalThis.__setTrpcHandler('videos.get', get);
    globalThis.__setTrpcHandler('videos.update', update);
    globalThis.__setTrpcHandler('memberships.removeTag', remove);
    const { result } = renderHook(() => {
      const query = useQuery(trpc.videos.get.queryOptions({ id: 7 }));
      return { query, editor: useVideoEditing({ video: query.data ?? null, videoId: 7 }) };
    });
    await waitFor(() => expect(result.current.query.data).toEqual(video));
    act(() => result.current.editor.startEditing());
    act(() => { result.current.editor.setEditedTitle('After'); result.current.editor.setEditedTagIds([]); });
    await act(async () => { await expect(result.current.editor.updateMutation.mutateAsync()).rejects.toThrow('Tag failed'); });
    await waitFor(() => expect(result.current.query.error?.message).toBe('Read failed'));
    expect(result.current.query.data).toEqual(saved);
    expect(result.current.editor.editedTagIds).toEqual([]);
    expect(result.current.editor.isEditing).toBe(true);
    await act(() => result.current.editor.updateMutation.mutateAsync());
    await waitFor(() => expect(result.current.query.data?.tags).toEqual([]));
    expect(update).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(result.current.editor.isEditing).toBe(false);
  });

  it('applies a delayed response to the original video after scope changes', async () => {
    const saved = { ...video, title: 'After' };
    const other = { ...video, id: 8, title: 'Other' };
    let finishSave!: (value: Video) => void;
    globalThis.__setTrpcHandler('videos.update', () => new Promise<Video>(resolve => { finishSave = resolve; }));
    const { result, rerender } = renderHook(({ current }) => ({
      client: useQueryClient(), editor: useVideoEditing({ video: current, videoId: current.id }),
    }), { initialProps: { current: video } });
    const originalKey = trpc.videos.get.queryKey({ id: 7 });
    const otherKey = trpc.videos.get.queryKey({ id: 8 });
    result.current.client.setQueryData(originalKey, video);
    result.current.client.setQueryData(otherKey, other);
    act(() => result.current.editor.startEditing());
    act(() => result.current.editor.setEditedTitle('After'));
    let save!: Promise<unknown>;
    act(() => { save = result.current.editor.updateMutation.mutateAsync(); });
    await waitFor(() => expect(finishSave).toBeDefined());
    rerender({ current: other });
    await act(async () => { finishSave(saved); await save; });
    expect(result.current.client.getQueryData(originalKey)).toEqual(saved);
    expect(result.current.client.getQueryData(otherKey)).toEqual(other);
    expect(result.current.client.getQueryState(otherKey)?.isInvalidated).toBe(false);
  });
});
