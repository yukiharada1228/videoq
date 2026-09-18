import { renderHook, act, waitFor } from '@testing-library/react'
import { useChatMessages } from '../useChatMessages'
import { apiClient } from '@/lib/api'

const setFeedback = vi.fn()

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    apiClient: {
      chatStream: vi.fn(),
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
    setFeedback.mockReset()
    globalThis.__setTrpcHandler('chat.feedback', setFeedback)
  })

  it('follows answer growth only at the bottom and leaves tool-only updates in place', () => {
    const { result } = renderHook(() => useChatMessages({ courseId: 18 }))
    const container = document.createElement('div')
    let height = 800
    let top = 400
    const scrollTo = vi.fn((value: number) => { top = Math.min(value, height - 400) })
    Object.defineProperties(container, {
      clientHeight: { get: () => 400 },
      scrollHeight: { get: () => height },
      scrollTop: { get: () => top, set: scrollTo },
    })
    result.current.messagesContainerRef.current = container

    height = 900
    act(() => result.current.setMessages([{ role: 'assistant', content: '回答の始まり' }]))
    expect(top).toBe(500)

    scrollTo.mockClear()
    act(() => result.current.setMessages([{ role: 'assistant', content: '回答の始まり', progress: {
      phase: 'searching', searches: [{ id: 1, query: '追加の検索', status: 'running' }],
    } }]))
    expect(scrollTo).not.toHaveBeenCalled()

    // A reader scrolls away from the bottom while more answer text arrives.
    top = 100
    act(() => result.current.handleMessagesScroll())
    height = 1000
    act(() => result.current.setMessages([{ role: 'assistant', content: '回答の続き' }]))
    expect(top).toBe(100)
    expect(scrollTo).not.toHaveBeenCalled()

    // Returning to the bottom resumes following subsequent content.
    top = 600
    act(() => result.current.handleMessagesScroll())
    height = 1100
    act(() => result.current.setMessages([{ role: 'assistant', content: '回答の終わり' }]))
    expect(top).toBe(700)
  })

  it('updates progress before answer content and retains it with the finished message', async () => {
    let resume!: () => void
    const waiting = new Promise<void>((resolve) => { resume = resolve })
    vi.mocked(apiClient.chatStream).mockImplementation(async function* () {
      yield { type: 'searching', search_id: 1, query: 'ドモルガンの定理' }
      await waiting
      yield { type: 'search_completed', search_id: 1, query: 'ドモルガンの定理', result_count: 20 }
      yield { type: 'content_chunk', text: '回答' }
      yield { type: 'done', chat_log_id: 12, feedback: null }
    })
    const { result } = renderHook(() => useChatMessages({ courseId: 18 }))
    act(() => { result.current.setInput('回路について') })
    let sending: Promise<void>
    act(() => { sending = result.current.handleSend() })
    await waitFor(() => expect(result.current.messages.at(-1)?.progress?.phase).toBe('searching'))
    expect(result.current.messages.at(-1)?.content).toBe('')
    expect(result.current.messages.at(-1)?.progress?.searches[0].query).toBe('ドモルガンの定理')
    await act(async () => { resume(); await sending! })
    expect(result.current.messages.at(-1)).toMatchObject({
      content: '回答', chatLogId: 12,
      progress: { phase: 'complete', searches: [{ query: 'ドモルガンの定理', status: 'complete', resultCount: 20 }] },
    })
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

  it('calls chatStream with courseId when provided', async () => {
    ;(apiClient.chatStream as any).mockImplementation(makeStreamMock(['ok']))

    const { result } = renderHook(() => useChatMessages({ courseId: 5 }))

    act(() => { result.current.setInput('Hi') })

    await act(async () => {
      await result.current.handleSend()
    })

    await waitFor(() => {
      expect(apiClient.chatStream).toHaveBeenCalledWith(
        expect.objectContaining({ course_id: 5 }),
        expect.any(AbortSignal),
      )
    })
  })

  it.each([
    { courseId: 5 },
    { courseId: 5, shareToken: 'shared' },
    {},
  ])('sends only the latest Q&A question while retaining visible messages (%j)', async (scope) => {
    vi.mocked(apiClient.chatStream).mockImplementation(makeStreamMock([]))
    const { result } = renderHook(() => useChatMessages(scope))
    const prior = [
      { role: 'user' as const, content: '内積とは？' },
      { role: 'assistant' as const, content: 'ベクトルの内積は…' },
    ]
    act(() => {
      result.current.setMessages(prior)
      result.current.setInput('具体例を教えて')
    })
    await act(async () => { await result.current.handleSend() })
    expect(apiClient.chatStream).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'qa',
        messages: [{ role: 'user', content: '具体例を教えて' }],
      }),
      expect.any(AbortSignal),
    )
    expect(result.current.messages.slice(0, 2)).toEqual(prior)
  })

  it('retains the preceding Study question within the 12-message history limit', async () => {
    vi.mocked(apiClient.chatStream).mockImplementation(makeStreamMock([]))
    const { result } = renderHook(() => useChatMessages({ courseId: 5, mode: 'study' }))
    const prior = Array.from({ length: 8 }, (_, index) => [
      { role: 'user' as const, content: `answer ${index}` },
      { role: 'assistant' as const, content: `question ${index}` },
    ]).flat()
    const reply = { role: 'user' as const, content: '0' }
    act(() => {
      result.current.setMessages([{ role: 'assistant', content: 'greeting' }, ...prior])
      result.current.setInput(reply.content)
    })
    await act(async () => { await result.current.handleSend() })
    expect(apiClient.chatStream).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'study',
        messages: [...prior.slice(-11), reply],
        study_session_id: expect.any(String),
      }),
      expect.any(AbortSignal),
    )
  })

  it('guards against rapid consecutive sends before loading state rerenders', async () => {
    const resolvers: Array<() => void> = []
    ;(apiClient.chatStream as any).mockImplementation(async function* () {
      await new Promise<void>((resolve) => resolvers.push(resolve))
      yield { type: 'done' as const, chat_log_id: null, feedback: null }
    })

    const { result } = renderHook(() => useChatMessages({}))

    act(() => { result.current.setInput('Hi') })

    await waitFor(() => {
      expect(result.current.input).toBe('Hi')
    })

    act(() => {
      void result.current.handleSend()
      void result.current.handleSend()
    })

    await waitFor(() => {
      expect(apiClient.chatStream).toHaveBeenCalledTimes(1)
    })

    act(() => {
      resolvers[0]?.()
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('toggles feedback back to null when the same feedback is selected', async () => {
    setFeedback.mockResolvedValue({
      chat_log_id: 42,
      feedback: null,
    })

    const { result } = renderHook(() => useChatMessages({ shareToken: 'shared' }))

    act(() => {
      result.current.setMessages([
        { role: 'assistant', content: 'Answer', chatLogId: 42, feedback: 'good' },
      ])
    })

    await act(async () => {
      await result.current.handleFeedback(42, 'good')
    })

    expect(setFeedback).toHaveBeenCalledWith({
      chatLogId: 42,
      feedback: null,
      shareSlug: 'shared',
    })
    expect(result.current.messages[0].feedback).toBeNull()
    expect(result.current.feedbackUpdatingId).toBeNull()
  })

  it('aborts an in-flight request and ignores late events after unmount', async () => {
    let resume!: () => void
    let signal!: AbortSignal
    const waiting = new Promise<void>(resolve => { resume = resolve })
    const closed = vi.fn()
    vi.mocked(apiClient.chatStream).mockImplementation(async function* (_, requestSignal) {
      signal = requestSignal!
      try {
        yield { type: 'searching', query: 'pending search', search_id: 1 }
        await waiting
        yield { type: 'content_chunk', text: 'Late answer' }
      } finally { closed() }
    })
    const { result, unmount } = renderHook(() => useChatMessages({ courseId: 3 }))
    act(() => result.current.setInput('hello'))
    let sending!: Promise<void>
    act(() => { sending = result.current.handleSend() })
    await waitFor(() => expect(result.current.messages.at(-1)?.progress?.phase).toBe('searching'))
    const lastMessage = result.current.messages.at(-1)
    unmount()
    expect(signal.aborted).toBe(true)
    const createTimer = vi.spyOn(globalThis, 'setInterval')
    await act(async () => { resume(); await sending })
    expect(closed).toHaveBeenCalledTimes(1)
    expect(lastMessage?.content).toBe('')
    expect(createTimer).not.toHaveBeenCalled()
    createTimer.mockRestore()
  })

  it('finishes and closes the stream on done without waiting for more network events', async () => {
    const nextRead = vi.fn()
    const closed = vi.fn()
    vi.mocked(apiClient.chatStream).mockImplementation(async function* () {
      try {
        yield { type: 'content_chunk', text: 'Done' }
        yield { type: 'done', chat_log_id: 42, feedback: null }
        nextRead()
        yield { type: 'content_chunk', text: 'Unexpected late content' }
      } finally { closed() }
    })
    const { result } = renderHook(() => useChatMessages({ courseId: 3 }))
    act(() => result.current.setInput('hello'))
    await act(async () => { await result.current.handleSend() })
    expect(result.current.messages.at(-1)).toMatchObject({ content: 'Done', chatLogId: 42 })
    expect(result.current.isLoading).toBe(false)
    expect(nextRead).not.toHaveBeenCalled()
    expect(closed).toHaveBeenCalledTimes(1)
  })
})
