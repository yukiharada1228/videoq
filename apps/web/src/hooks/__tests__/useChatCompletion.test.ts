import { act, renderHook, waitFor } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
import type { RpcOutputMap } from '@videoq/trpc';
import { apiClient } from '@/lib/api';
import { trpc } from '@/lib/trpc';
import { useChatMessages } from '../useChatMessages';
import { useChatHistory } from '../useChatHistory';
import { useChatAnalytics } from '../useChatAnalytics';

const emptyHistory: RpcOutputMap['chat.history'] = {
  data: [], meta: { total: 0, limit: 100, offset: 0 },
};
const savedHistory: RpcOutputMap['chat.history'] = {
  ...emptyHistory,
  data: [{ id: 42, course: 7, question: 'Question',
    answer: { segments: [{ text: 'Answer', sourceIds: [] }], sources: [] },
    is_shared_origin: false, feedback: null, created_at: '2026-09-28T00:00:00Z' }],
  meta: { ...emptyHistory.meta, total: 1 },
};
const analytics = (total: number): RpcOutputMap['chat.analytics'] => ({
  summary: { total_questions: total, date_range: { first: null, last: null } },
  time_series: [], feedback: { good: 0, bad: 0, none: total },
});
const keysFor = (courseId: number) => [
  trpc.chat.history.queryKey({ courseId, limit: 100, offset: 0 }),
  trpc.chat.analytics.queryKey({ courseId }),
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('chat completion refreshes', () => {
  afterEach(() => vi.restoreAllMocks());

  it('refreshes open history and recent analytics after a saved answer', async () => {
    const readHistory = vi.fn().mockResolvedValueOnce(emptyHistory).mockResolvedValue(savedHistory);
    const readAnalytics = vi.fn().mockResolvedValueOnce(analytics(0)).mockResolvedValue(analytics(1));
    globalThis.__setTrpcHandler('chat.history', readHistory);
    globalThis.__setTrpcHandler('chat.analytics', readAnalytics);
    vi.spyOn(apiClient, 'chatStream').mockImplementation(async function* () {
      yield { type: 'text_delta', segmentIndex: 0, text: 'Answer' };
      yield { type: 'done', chat_log_id: 42, feedback: null };
    });
    const { result } = renderHook(() => ({
      chat: useChatMessages({ courseId: 7 }),
      history: useChatHistory({ courseId: 7, enabled: true }),
      analytics: useChatAnalytics(7),
    }));
    await waitFor(() => expect(result.current.analytics.data).toEqual(analytics(0)));
    await waitFor(() => expect(result.current.history.history).toEqual([]));
    act(() => result.current.chat.setInput('Question'));
    await act(() => result.current.chat.handleSend());
    await waitFor(() => expect(result.current.history.history?.[0]?.id).toBe(42));
    await waitFor(() => expect(result.current.analytics.data).toEqual(analytics(1)));
    expect(readHistory).toHaveBeenCalledTimes(2);
    expect(readAnalytics).toHaveBeenCalledTimes(2);
  });

  it('restarts a first history read so its older snapshot cannot hide the saved answer', async () => {
    const pending = deferred<typeof emptyHistory>();
    const read = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(savedHistory);
    globalThis.__setTrpcHandler('chat.history', read);
    vi.spyOn(apiClient, 'chatStream').mockImplementation(async function* () {
      yield { type: 'done', chat_log_id: 42, feedback: null };
    });
    const { result } = renderHook(() => ({
      chat: useChatMessages({ courseId: 7 }),
      history: useChatHistory({ courseId: 7, enabled: true }),
    }));
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    act(() => result.current.chat.setInput('Question'));
    await act(() => result.current.chat.handleSend());
    await act(async () => { pending.resolve(emptyHistory); });
    await waitFor(() => expect(result.current.history.history?.[0]?.id).toBe(42));
    expect(read).toHaveBeenCalledTimes(2);
  });

  it.each([
    { scope: { courseId: 7 }, saved: true, refreshCourse: true, refreshUsage: true },
    { scope: {}, saved: true, refreshCourse: false, refreshUsage: true },
    { scope: { courseId: 7, shareToken: 'shared' }, saved: true, refreshCourse: false, refreshUsage: false },
    { scope: { courseId: 7 }, saved: false, refreshCourse: false, refreshUsage: false },
  ])('scopes cache updates for $scope, saved=$saved', async ({ scope, saved, refreshCourse, refreshUsage }) => {
    vi.spyOn(apiClient, 'chatStream').mockImplementation(async function* () {
      if (saved) yield { type: 'done', chat_log_id: scope.courseId ? 42 : null, feedback: null };
      else yield { type: 'error', code: 'OVER_QUOTA', message: '' };
    });
    const { result } = renderHook(() => ({ chat: useChatMessages(scope), client: useQueryClient() }));
    const courseKeys = keysFor(7);
    const otherKeys = keysFor(8);
    const usageKey = trpc.account.me.queryKey();
    for (const key of [...courseKeys, ...otherKeys, usageKey]) result.current.client.setQueryData(key, { cached: true });
    act(() => result.current.chat.setInput('Question'));
    await act(() => result.current.chat.handleSend());
    for (const key of courseKeys) expect(result.current.client.getQueryState(key)?.isInvalidated).toBe(refreshCourse);
    for (const key of otherKeys) expect(result.current.client.getQueryState(key)?.isInvalidated).toBe(false);
    expect(result.current.client.getQueryState(usageKey)?.isInvalidated).toBe(refreshUsage);
  });

  it('invalidates persisted data even if unmounted before the next render tick', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(apiClient, 'chatStream').mockImplementation(async function* () {
        yield { type: 'text_delta', segmentIndex: 0, text: 'Long answer'.repeat(50) };
        yield { type: 'done', chat_log_id: 42, feedback: null };
      });
      const { result, unmount } = renderHook(() => ({ chat: useChatMessages({ courseId: 7 }), client: useQueryClient() }));
      const client = result.current.client;
      const keys = keysFor(7);
      for (const key of keys) client.setQueryData(key, { cached: true });
      act(() => result.current.chat.setInput('Question'));
      let sending!: Promise<void>;
      await act(async () => { sending = result.current.chat.handleSend(); });
      expect(result.current.chat.messages.at(-1)?.progress?.phase).toBe('complete');
      expect(result.current.chat.isLoading).toBe(true);
      unmount();
      await sending;
      for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
