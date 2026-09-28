import { act, renderHook, waitFor } from '@testing-library/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RpcOutputMap } from '@videoq/trpc';
import { trpc } from '@/lib/trpc';
import { useChatMessages } from '../useChatMessages';
import { useChatAnalytics } from '../useChatAnalytics';

type History = RpcOutputMap['chat.history'];
const history: History = {
  data: [{ id: 42, course: 7, question: 'Question', answer: { segments: [{ text: 'Answer', sourceIds: [] }], sources: [] },
    is_shared_origin: false, created_at: '2026-09-23T00:00:00Z', feedback: null }],
  meta: { total: 1, limit: 100, offset: 0 },
};
const input = { courseId: 7, limit: 100, offset: 0 };
const key = trpc.chat.history.queryKey(input);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function useFeedback(shareToken?: string) {
  return { chat: useChatMessages({ courseId: 7, shareToken }), client: useQueryClient() };
}

describe('chat feedback saves', () => {
  it('refreshes the open analytics dashboard after feedback changes', async () => {
    const initial: RpcOutputMap['chat.analytics'] = {
      summary: { total_questions: 1, date_range: { first: null, last: null } },
      time_series: [], feedback: { good: 0, bad: 0, none: 1 },
    };
    const saved = { ...initial, feedback: { good: 1, bad: 0, none: 0 } };
    const read = vi.fn().mockResolvedValueOnce(initial).mockResolvedValue(saved);
    globalThis.__setTrpcHandler('chat.analytics', read);
    globalThis.__setTrpcHandler('chat.feedback', () => ({ chat_log_id: 42, feedback: 'good' }));
    const { result } = renderHook(() => ({ ...useFeedback(), analytics: useChatAnalytics(7) }));
    await waitFor(() => expect(result.current.analytics.data).toEqual(initial));
    act(() => result.current.chat.setMessages([{ role: 'assistant', answer: history.data[0].answer, chatLogId: 42 }]));
    await act(() => result.current.chat.handleFeedback(42, 'good'));
    await waitFor(() => expect(result.current.analytics.data).toEqual(saved));
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('sends one request per answer and tracks concurrent answers independently', async () => {
    const saves = new Map([42, 43].map(id => [id, deferred<RpcOutputMap['chat.feedback']>()]));
    const update = vi.fn((value: unknown) => saves.get((value as { chatLogId: number }).chatLogId)!.promise);
    globalThis.__setTrpcHandler('chat.feedback', update);
    const { result } = renderHook(() => useFeedback());
    act(() => result.current.chat.setMessages([42, 43].map(chatLogId => ({
      role: 'assistant', answer: { segments: [{ text: 'Answer', sourceIds: [] }], sources: [] }, chatLogId, feedback: null,
    }))));

    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    act(() => {
      first = result.current.chat.handleFeedback(42, 'good');
      void result.current.chat.handleFeedback(42, 'bad');
    });
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    // Start a separate HTTP batch so the second response can finish first.
    act(() => { second = result.current.chat.handleFeedback(43, 'bad'); });
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(result.current.chat.feedbackUpdatingIds).toEqual(new Set([42, 43]));
    await act(async () => { saves.get(43)!.resolve({ chat_log_id: 43, feedback: 'bad' }); await second; });
    expect(result.current.chat.feedbackUpdatingIds).toEqual(new Set([42]));
    await act(async () => { saves.get(42)!.resolve({ chat_log_id: 42, feedback: 'good' }); await first; });
    expect(result.current.chat.feedbackUpdatingIds.size).toBe(0);
    expect(result.current.chat.messages.map(message => message.feedback)).toEqual(['good', 'bad']);

    update.mockResolvedValue({ chat_log_id: 42, feedback: null });
    await act(() => result.current.chat.handleFeedback(42, 'good'));
    expect(update).toHaveBeenLastCalledWith({ chatLogId: 42, feedback: null });
    expect(result.current.chat.messages[0].feedback).toBeNull();
  });

  it('updates all cached history pages for the course and ignores a late old read', async () => {
    const pending = deferred<History>();
    const read = vi.fn(() => pending.promise);
    globalThis.__setTrpcHandler('chat.history', read);
    globalThis.__setTrpcHandler('chat.feedback', () => ({ chat_log_id: 42, feedback: 'good' }));
    const { result } = renderHook(() => ({
      ...useFeedback(),
      query: useQuery(trpc.chat.history.queryOptions(input, { initialData: history, staleTime: Infinity })),
    }));
    const otherPageKey = trpc.chat.history.queryKey({ ...input, limit: 20 });
    const otherCourseKey = trpc.chat.history.queryKey({ ...input, courseId: 8 });
    result.current.client.setQueryData(otherPageKey, history);
    result.current.client.setQueryData(otherCourseKey, history);
    act(() => result.current.chat.setMessages([{ role: 'assistant', answer: { segments: [{ text: 'Answer', sourceIds: [] }], sources: [] }, chatLogId: 42 }]));
    let fetching!: Promise<void>;
    act(() => { fetching = result.current.client.refetchQueries({ queryKey: key, exact: true }); });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    await act(() => result.current.chat.handleFeedback(42, 'good'));
    await act(async () => { pending.resolve(history); await fetching; });

    for (const cacheKey of [key, otherPageKey]) {
      expect(result.current.client.getQueryData(cacheKey)?.data[0].feedback).toBe('good');
    }
    expect(result.current.client.getQueryData(otherCourseKey)).toEqual(history);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('restarts an initial history read after saving instead of leaving it pending', async () => {
    const pending = deferred<History>();
    const saved: History = { ...history, data: [{ ...history.data[0], feedback: 'good' }] };
    const read = vi.fn().mockImplementationOnce(() => pending.promise).mockResolvedValue(saved);
    globalThis.__setTrpcHandler('chat.history', read);
    globalThis.__setTrpcHandler('chat.feedback', () => ({ chat_log_id: 42, feedback: 'good' }));
    const { result } = renderHook(() => ({
      ...useFeedback(), query: useQuery(trpc.chat.history.queryOptions(input)),
    }));
    act(() => result.current.chat.setMessages([{ role: 'assistant', answer: { segments: [{ text: 'Answer', sourceIds: [] }], sources: [] }, chatLogId: 42 }]));
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    await act(() => result.current.chat.handleFeedback(42, 'good'));
    await act(async () => { pending.resolve(history); await pending.promise; });

    await waitFor(() => expect(result.current.query.data).toEqual(saved));
    expect(result.current.query.isFetching).toBe(false);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('preserves feedback on failure and releases the answer for retry', async () => {
    const update = vi.fn().mockRejectedValueOnce(new Error('Save failed'))
      .mockResolvedValue({ chat_log_id: 42, feedback: 'good' });
    globalThis.__setTrpcHandler('chat.feedback', update);
    const { result } = renderHook(() => useFeedback());
    result.current.client.setQueryData(key, history);
    act(() => result.current.chat.setMessages([{ role: 'assistant', answer: { segments: [{ text: 'Answer', sourceIds: [] }], sources: [] }, chatLogId: 42, feedback: null }]));
    await act(() => result.current.chat.handleFeedback(42, 'good'));
    expect(result.current.chat.messages[0].feedback).toBeNull();
    expect(result.current.client.getQueryData(key)).toEqual(history);
    expect(result.current.chat.feedbackUpdatingIds.size).toBe(0);
    await act(() => result.current.chat.handleFeedback(42, 'good'));
    expect(result.current.client.getQueryData(key)?.data[0].feedback).toBe('good');
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('does not create or fetch an unopened history cache', async () => {
    const read = vi.fn();
    globalThis.__setTrpcHandler('chat.history', read);
    globalThis.__setTrpcHandler('chat.feedback', () => ({ chat_log_id: 42, feedback: 'good' }));
    const { result } = renderHook(() => useFeedback());
    act(() => result.current.chat.setMessages([{ role: 'assistant', answer: { segments: [{ text: 'Answer', sourceIds: [] }], sources: [] }, chatLogId: 42 }]));
    await act(() => result.current.chat.handleFeedback(42, 'good'));
    expect(result.current.client.getQueryData(key)).toBeUndefined();
    expect(read).not.toHaveBeenCalled();
  });

  it('keeps shared feedback scoped to the shared conversation', async () => {
    const update = vi.fn(() => ({ chat_log_id: 42, feedback: 'bad' }));
    globalThis.__setTrpcHandler('chat.feedback', update);
    const { result } = renderHook(() => useFeedback('shared'));
    result.current.client.setQueryData(key, history);
    const analyticsKey = trpc.chat.analytics.queryKey({ courseId: 7 });
    result.current.client.setQueryData(analyticsKey, { cached: true });
    act(() => result.current.chat.setMessages([{ role: 'assistant', answer: { segments: [{ text: 'Answer', sourceIds: [] }], sources: [] }, chatLogId: 42 }]));
    await act(() => result.current.chat.handleFeedback(42, 'bad'));
    expect(update).toHaveBeenCalledExactlyOnceWith({ chatLogId: 42, feedback: 'bad', shareSlug: 'shared' });
    expect(result.current.chat.messages[0].feedback).toBe('bad');
    expect(result.current.client.getQueryData(key)).toEqual(history);
    expect(result.current.client.getQueryState(analyticsKey)?.isInvalidated).toBe(false);
  });

  it('applies an unmounted conversation save only to its original course cache', async () => {
    const pending = deferred<RpcOutputMap['chat.feedback']>();
    globalThis.__setTrpcHandler('chat.feedback', () => pending.promise);
    const { result, unmount } = renderHook(() => useFeedback());
    const client = result.current.client;
    const otherKey = trpc.chat.history.queryKey({ ...input, courseId: 8 });
    const analyticsKey = trpc.chat.analytics.queryKey({ courseId: 7 });
    const otherAnalyticsKey = trpc.chat.analytics.queryKey({ courseId: 8 });
    client.setQueryData(key, history);
    client.setQueryData(otherKey, history);
    client.setQueryData(analyticsKey, { cached: true });
    client.setQueryData(otherAnalyticsKey, { cached: true });
    act(() => result.current.chat.setMessages([{ role: 'assistant', answer: { segments: [{ text: 'Answer', sourceIds: [] }], sources: [] }, chatLogId: 42 }]));
    let saving!: Promise<unknown>;
    act(() => { saving = result.current.chat.handleFeedback(42, 'good'); });
    unmount();
    await act(async () => { pending.resolve({ chat_log_id: 42, feedback: 'good' }); await saving; });
    expect(client.getQueryData(key)?.data[0].feedback).toBe('good');
    expect(client.getQueryData(otherKey)).toEqual(history);
    expect(client.getQueryState(analyticsKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherAnalyticsKey)?.isInvalidated).toBe(false);
  });
});
