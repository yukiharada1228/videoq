import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
import type { RpcOutputMap } from '@videoq/trpc';
import { apiClient } from '@/lib/api';
import { trpc } from '@/lib/trpc';
import { ChatPanel } from '../ChatPanel';

const input = { courseId: 7, limit: 100, offset: 0 };
const historyKey = trpc.chat.history.queryKey(input);
const evaluationKey = trpc.evaluation.logs.queryKey(input);
const history: RpcOutputMap['chat.history'] = {
  data: [{ id: 42, course: 7, question: 'Saved question', answer: 'Saved answer',
    is_shared_origin: false, created_at: '2026-09-23T00:00:00Z', feedback: null }],
  meta: { total: 1, limit: 100, offset: 0 },
};
const evaluations: RpcOutputMap['evaluation.logs'] = {
  data: [{ chat_log_id: 42, status: 'completed', faithfulness: 0.94,
    answer_relevancy: 0.88, context_precision: 1, error_message: null, evaluated_at: null }],
  meta: { total: 1, limit: 100, offset: 0 },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function openHistory() {
  fireEvent.click(screen.getByRole('button', { name: 'chat.history' }));
}

function expectHistory() {
  expect(screen.getByText('Saved question')).toBeInTheDocument();
  expect(screen.getByText('Saved answer')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'chat.exportCsvShort' })).toBeEnabled();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
}

describe('chat history loading and export', () => {
  const readHistory = vi.fn();
  const readEvaluations = vi.fn();

  beforeEach(() => {
    readHistory.mockReset().mockResolvedValue(history);
    readEvaluations.mockReset().mockResolvedValue(evaluations);
    globalThis.__setTrpcHandler('chat.history', readHistory);
    globalThis.__setTrpcHandler('evaluation.logs', readEvaluations);
  });

  it('loads history before requesting optional evaluations and displays it while they load', async () => {
    const pendingHistory = deferred<typeof history>();
    const pendingEvaluations = deferred<typeof evaluations>();
    readHistory.mockReturnValue(pendingHistory.promise);
    readEvaluations.mockReturnValue(pendingEvaluations.promise);
    render(<ChatPanel courseId={7} />);
    expect(readHistory).not.toHaveBeenCalled();
    expect(readEvaluations).not.toHaveBeenCalled();
    openHistory();
    try {
      await waitFor(() => expect(readHistory).toHaveBeenCalledTimes(1));
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(readEvaluations).not.toHaveBeenCalled();
      await act(async () => { pendingHistory.resolve(history); });
      await screen.findByText('Saved answer');
      await waitFor(() => expect(readEvaluations).toHaveBeenCalledExactlyOnceWith(input));
      expectHistory();
    } finally {
      await act(async () => {
        pendingHistory.resolve(history);
        pendingEvaluations.resolve(evaluations);
      });
    }
    await screen.findByText('94%');
    expect(readHistory).toHaveBeenCalledExactlyOnceWith(input);
    expectHistory();
  });

  it('does not request evaluations for an empty history', async () => {
    readHistory.mockResolvedValue({ data: [], meta: { ...history.meta, total: 0 } });
    render(<ChatPanel courseId={7} />);
    openHistory();
    await screen.findByText('chat.historyEmpty');
    expect(readEvaluations).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'chat.exportCsvShort' })).not.toBeInTheDocument();
  });

  it('shows an initial history error without requesting evaluations', async () => {
    readHistory.mockRejectedValue(new Error('History failed'));
    render(<ChatPanel courseId={7} />);
    openHistory();
    expect(await screen.findByRole('alert')).toHaveTextContent('History failed');
    expect(readEvaluations).not.toHaveBeenCalled();
    expect(screen.queryByText('chat.historyEmpty')).not.toBeInTheDocument();
  });

  it('keeps history usable when evaluation loading fails', async () => {
    readEvaluations.mockRejectedValue(new Error('Evaluation failed'));
    const { result } = renderHook(() => useQueryClient());
    render(<ChatPanel courseId={7} />);
    openHistory();
    await waitFor(() => expect(result.current.getQueryState(evaluationKey)?.status).toBe('error'));
    expectHistory();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each(['success', 'error'] as const)('keeps cached history mounted during a background refresh ending in %s', async (outcome) => {
    const { result } = renderHook(() => useQueryClient());
    render(<ChatPanel courseId={7} />);
    openHistory();
    await screen.findByText('94%');
    const answer = screen.getByText('Saved answer');
    const pending = deferred<typeof history>();
    readHistory.mockReturnValueOnce(pending.promise);
    let refreshing!: Promise<void>;
    act(() => { refreshing = result.current.refetchQueries({ queryKey: historyKey, exact: true }); });
    try {
      await waitFor(() => expect(readHistory).toHaveBeenCalledTimes(2));
      expectHistory();
      expect(screen.getByText('Saved answer')).toBe(answer);
    } finally {
      await act(async () => {
        if (outcome === 'error') pending.reject(new Error('Refresh failed'));
        else pending.resolve({ ...history, data: [{ ...history.data[0], question: 'Updated question' }] });
        await refreshing;
      });
    }
    if (outcome === 'error') {
      expect(await screen.findByRole('alert')).toHaveTextContent('Refresh failed');
      expectHistory();
      readHistory.mockResolvedValue(history);
      await act(() => result.current.refetchQueries({ queryKey: historyKey, exact: true }));
      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    } else {
      await screen.findByText('Updated question');
      expect(screen.queryByText('Saved question')).not.toBeInTheDocument();
    }
    expect(screen.getByText('Saved answer')).toBe(answer);
    expect(readEvaluations).toHaveBeenCalledTimes(1);
  });

  it('keeps cached history and scores visible while evaluations refresh', async () => {
    const { result } = renderHook(() => useQueryClient());
    render(<ChatPanel courseId={7} />);
    openHistory();
    await screen.findByText('94%');
    const pending = deferred<typeof evaluations>();
    readEvaluations.mockReturnValueOnce(pending.promise);
    let refreshing!: Promise<void>;
    act(() => { refreshing = result.current.refetchQueries({ queryKey: evaluationKey, exact: true }); });
    try {
      await waitFor(() => expect(readEvaluations).toHaveBeenCalledTimes(2));
      expectHistory();
      expect(screen.getByText('94%')).toBeInTheDocument();
    } finally {
      await act(async () => { pending.resolve({ ...evaluations, data: [] }); await refreshing; });
    }
    await waitFor(() => expect(screen.queryByText('94%')).not.toBeInTheDocument());
    expectHistory();
    expect(readHistory).toHaveBeenCalledTimes(1);
  });

  it('keeps export disabled until failure and allows retry with one error report', async () => {
    const pending = deferred<void>();
    const exportCsv = vi.spyOn(apiClient, 'exportChatHistoryCsv')
      .mockReturnValueOnce(pending.promise).mockResolvedValue(undefined);
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(<ChatPanel courseId={7} />);
      openHistory();
      const button = await screen.findByRole('button', { name: 'chat.exportCsvShort' });
      fireEvent.click(button);
      await waitFor(() => expect(button).toBeDisabled());
      fireEvent.click(button);
      expect(exportCsv).toHaveBeenCalledExactlyOnceWith(7);
      await act(async () => { pending.reject(new Error('Export failed')); });
      await waitFor(() => expect(button).toBeEnabled());
      expect(report).toHaveBeenCalledExactlyOnceWith('Failed to export CSV', expect.any(Error));
      fireEvent.click(button);
      await waitFor(() => expect(exportCsv).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(button).toBeEnabled());
    } finally {
      await act(async () => { pending.resolve(); });
      exportCsv.mockRestore();
      report.mockRestore();
    }
  });

  it('keeps a late evaluation response within its original course', async () => {
    const pending = deferred<typeof evaluations>();
    readEvaluations.mockReturnValueOnce(pending.promise)
      .mockResolvedValue({ ...evaluations, data: [] });
    const { result } = renderHook(() => useQueryClient());
    const { rerender } = render(<ChatPanel courseId={7} />);
    openHistory();
    await screen.findByText('Saved answer');
    await waitFor(() => expect(readEvaluations).toHaveBeenCalledTimes(1));
    readHistory.mockResolvedValue({
      ...history, data: [{ ...history.data[0], id: 43, course: 8, question: 'Other question', answer: 'Other answer' }],
    });
    try {
      rerender(<ChatPanel courseId={8} />);
      expect(screen.queryByText('Saved answer')).not.toBeInTheDocument();
      openHistory();
      await screen.findByText('Other answer');
      await waitFor(() => expect(readEvaluations).toHaveBeenCalledTimes(2));
    } finally {
      await act(async () => { pending.resolve(evaluations); });
    }
    await waitFor(() => expect(result.current.isFetching()).toBe(0));
    expect(screen.getByText('Other answer')).toBeInTheDocument();
    expect(screen.queryByText('Saved answer')).not.toBeInTheDocument();
    expect(screen.queryByText('94%')).not.toBeInTheDocument();
    expect(result.current.getQueryData(evaluationKey)).toEqual(evaluations);
  });
});
