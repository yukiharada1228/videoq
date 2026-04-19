import { renderHook, act, waitFor } from '@testing-library/react'
import { useChatMessages } from '../useChatMessages'
import { apiClient } from '@/lib/api'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    apiClient: {
      chatStream: vi.fn(),
      setChatFeedback: vi.fn(),
    },
  }
})

// Helper: create an async generator mock for chatStream
function makeStreamMock(
  chunks: string[],
  done?: { chat_log_id?: number | null; feedback?: 'good' | 'bad' | null; citations?: unknown[] },
) {
  return async function* () {
    for (const text of chunks) {
      yield { type: 'content_chunk' as const, text }
    }
    yield {
      type: 'done' as const,
      chat_log_id: done?.chat_log_id ?? null,
      feedback: done?.feedback ?? null,
      citations: done?.citations,
    }
  }
}

describe('useChatMessages streaming', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('adds an empty assistant message immediately when sending', async () => {
    ;(apiClient.chatStream as any).mockImplementation(makeStreamMock([]))

    const { result } = renderHook(() => useChatMessages({}))

    act(() => {
      result.current.setInput('Hello')
    })

    act(() => {
      void result.current.handleSend()
    })

    // After send is triggered, an empty assistant message should appear
    await waitFor(() => {
      const messages = result.current.messages
      const assistantMsgs = messages.filter((m) => m.role === 'assistant')
      // greeting + new empty one
      expect(assistantMsgs.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('accumulates content as content_chunk events arrive', async () => {
    ;(apiClient.chatStream as any).mockImplementation(
      makeStreamMock(['Hello ', 'World']),
    )

    const { result } = renderHook(() => useChatMessages({}))

    act(() => {
      result.current.setInput('Hi')
    })

    await act(async () => {
      await result.current.handleSend()
    })

    await waitFor(() => {
      const last = result.current.messages.at(-1)
      expect(last?.content).toBe('Hello World')
    })
  })

  it('sets chatLogId and feedback from done event', async () => {
    ;(apiClient.chatStream as any).mockImplementation(
      makeStreamMock(['Response'], { chat_log_id: 99, feedback: null }),
    )

    const { result } = renderHook(() => useChatMessages({}))

    act(() => { result.current.setInput('Hi') })

    await act(async () => { await result.current.handleSend() })

    await waitFor(() => {
      const last = result.current.messages.at(-1)
      expect(last?.chatLogId).toBe(99)
      expect(last?.feedback).toBeNull()
    })
  })

  it('shows error message when stream yields error event', async () => {
    ;(apiClient.chatStream as any).mockImplementation(async function* () {
      yield { type: 'error', code: 'LLM_PROVIDER_ERROR', message: 'Internal error' }
    })

    const { result } = renderHook(() => useChatMessages({}))

    act(() => { result.current.setInput('Hi') })

    await act(async () => { await result.current.handleSend() })

    await waitFor(() => {
      const last = result.current.messages.at(-1)
      expect(last?.role).toBe('assistant')
      expect(last?.content).toMatch(/chat\.error/)
    })
  })

  it('shows error message when chatStream throws', async () => {
    ;(apiClient.chatStream as any).mockImplementation(async function* () {
      throw new Error('Network error')
      yield // make it a generator
    })

    const { result } = renderHook(() => useChatMessages({}))

    act(() => { result.current.setInput('Hi') })

    await act(async () => { await result.current.handleSend() })

    await waitFor(() => {
      const last = result.current.messages.at(-1)
      expect(last?.role).toBe('assistant')
      expect(last?.content).toMatch(/chat\.error/)
    })
  })

  it('sets isLoading to false after streaming completes', async () => {
    ;(apiClient.chatStream as any).mockImplementation(makeStreamMock(['Done']))

    const { result } = renderHook(() => useChatMessages({}))

    act(() => { result.current.setInput('Hi') })

    await act(async () => {
      await result.current.handleSend()
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('updates message content after each token (intermediate state visible between tokens)', async () => {
    const resolvers: Array<() => void> = []

    ;(apiClient.chatStream as any).mockImplementation(async function* () {
      yield { type: 'content_chunk' as const, text: 'A' }
      // Pause — simulates network gap between tokens
      await new Promise<void>((resolve) => resolvers.push(resolve))
      yield { type: 'content_chunk' as const, text: 'B' }
      yield { type: 'done' as const, chat_log_id: null, feedback: null }
    })

    const { result } = renderHook(() => useChatMessages({}))
    act(() => { result.current.setInput('Hi') })

    // Start streaming without awaiting
    act(() => { void result.current.handleSend() })

    // First token should be visible before second arrives
    await waitFor(() => {
      expect(result.current.messages.at(-1)?.content).toBe('A')
    })

    // Release second token
    act(() => { resolvers[0]?.() })

    // Both tokens should now be visible
    await waitFor(() => {
      expect(result.current.messages.at(-1)?.content).toBe('AB')
    })
  })

  it('renders a bursty chunk over multiple ticks instead of showing all text at once', async () => {
    vi.useFakeTimers()
    ;(apiClient.chatStream as any).mockImplementation(async function* () {
      yield { type: 'content_chunk' as const, text: 'ABCDEF' }
      yield { type: 'done' as const, chat_log_id: null, feedback: null }
    })

    const { result } = renderHook(() => useChatMessages({}))

    act(() => { result.current.setInput('Hi') })

    act(() => { void result.current.handleSend() })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(24)
    })
    expect(result.current.messages.at(-1)?.content).toBe('ABC')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(24)
    })
    expect(result.current.messages.at(-1)?.content).toBe('ABCDEF')

    vi.useRealTimers()
  })

  it('calls chatStream with groupId when provided', async () => {
    ;(apiClient.chatStream as any).mockImplementation(makeStreamMock(['ok']))

    const { result } = renderHook(() => useChatMessages({ groupId: 5 }))

    act(() => { result.current.setInput('Hi') })

    await act(async () => {
      await result.current.handleSend()
    })

    await waitFor(() => {
      expect(apiClient.chatStream).toHaveBeenCalledWith(
        expect.objectContaining({ group_id: 5 }),
      )
    })
  })
})
