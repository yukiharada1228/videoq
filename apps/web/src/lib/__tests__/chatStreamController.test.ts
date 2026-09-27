import {
  ChatStreamController,
  chatStreamReducer,
  createInitialChatStreamState,
} from '@/lib/chatStreamController'
import type { ChatStreamEvent, Citation } from '@/lib/api'
import type { ChatContentPart } from '@videoq/trpc/chat'

const citation: Citation = {
  id: 1,
  video_id: 10,
  title: 'Video',
  start_time: '00:00:05',
  end_time: '00:00:10',
}

describe('chatStreamReducer', () => {
  it('queues content chunks and keeps done metadata pending until the queue is drained', () => {
    let state = createInitialChatStreamState()

    state = chatStreamReducer(state, {
      type: 'stream_event',
      event: { type: 'content_chunk', text: 'Hello ' },
    })
    state = chatStreamReducer(state, {
      type: 'stream_event',
      event: { type: 'content_chunk', text: 'World' },
    })
    state = chatStreamReducer(state, {
      type: 'stream_event',
      event: {
        type: 'done',
        chat_log_id: 99,
        feedback: 'good',
        citations: [citation],
      },
    })

    expect(state.queuedContent).toBe('Hello World')
    expect(state.streamFinished).toBe(true)
    expect(state.doneEvent).toEqual({
      type: 'done',
      chat_log_id: 99,
      feedback: 'good',
      citations: [citation],
    })
  })

  it('clears pending content and metadata when an error event arrives', () => {
    let state = createInitialChatStreamState()

    state = chatStreamReducer(state, {
      type: 'stream_event',
      event: { type: 'content_chunk', text: 'Partial answer' },
    })
    state = chatStreamReducer(state, {
      type: 'stream_event',
      event: {
        type: 'done',
        chat_log_id: 1,
        feedback: null,
      },
    })
    state = chatStreamReducer(state, {
      type: 'stream_event',
      event: {
        type: 'error',
        code: 'LLM_PROVIDER_ERROR',
        message: 'failed',
      },
    })

    expect(state.queuedContent).toBe('')
    expect(state.doneEvent).toBeNull()
    expect(state.streamFinished).toBe(true)
  })
})

describe('ChatStreamController', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps typed references atomic and ordered, with completion after every part is rendered', async () => {
    const rendered: ChatContentPart[][] = []
    const onDone = vi.fn()
    const legacy = vi.fn()
    const controller = new ChatStreamController({
      onAppendContent: legacy,
      onAppendParts: (parts) => rendered.push(parts),
      onDone, onError: vi.fn(),
    })
    controller.start()
    controller.handleEvent({ type: 'source', source: citation })
    await vi.advanceTimersByTimeAsync(24)
    expect(rendered).toEqual([])
    controller.handleEvent({ type: 'text_delta', text: 'AB' })
    controller.handleEvent({ type: 'citation', sourceId: 1 })
    controller.handleEvent({ type: 'citation', sourceId: 1 })
    controller.handleEvent({ type: 'text_delta', text: 'CDEF' })
    controller.handleEvent({ type: 'done', chat_log_id: 1, feedback: null })
    const complete = controller.complete()
    await vi.advanceTimersByTimeAsync(24)
    expect(rendered).toEqual([[
      { type: 'text', text: 'AB' }, { type: 'citation', sourceId: 1 },
      { type: 'citation', sourceId: 1 }, { type: 'text', text: 'C' },
    ]])
    expect(onDone).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(24)
    await complete
    expect(rendered[1]).toEqual([{ type: 'text', text: 'DEF' }])
    expect(onDone).toHaveBeenCalledOnce()
    expect(legacy).not.toHaveBeenCalled()
  })

  it('discards queued typed parts on error or abort and starts the next answer cleanly', async () => {
    const onAppendParts = vi.fn()
    const onError = vi.fn()
    const controller = new ChatStreamController({ onAppendContent: vi.fn(), onAppendParts, onDone: vi.fn(), onError })
    controller.start()
    controller.handleEvent({ type: 'text_delta', text: 'old answer' })
    controller.handleEvent({ type: 'citation', sourceId: 1 })
    controller.handleEvent({ type: 'error', code: 'STREAM_FAILED', message: '' })
    await vi.advanceTimersByTimeAsync(24)
    expect(onAppendParts).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledOnce()
    controller.start()
    controller.handleEvent({ type: 'citation', sourceId: 2 })
    controller.abort()
    controller.start()
    controller.handleEvent({ type: 'text_delta', text: 'new' })
    controller.handleEvent({ type: 'done', chat_log_id: 2, feedback: null })
    const complete = controller.complete()
    await vi.advanceTimersByTimeAsync(24)
    await complete
    expect(onAppendParts).toHaveBeenCalledExactlyOnceWith([{ type: 'text', text: 'new' }])
  })

  it('drains content over render ticks and applies done metadata only after draining', async () => {
    const rendered: string[] = []
    const doneEvents: ChatStreamEvent[] = []
    const controller = new ChatStreamController({
      onAppendContent: (text) => rendered.push(text),
      onDone: (event) => doneEvents.push(event),
      onError: vi.fn(),
    })

    controller.start()
    controller.handleEvent({ type: 'content_chunk', text: 'ABCDEF' })
    controller.handleEvent({
      type: 'done',
      chat_log_id: 42,
      feedback: 'bad',
      citations: [citation],
    })

    const completion = controller.complete()

    expect(rendered).toEqual([])
    expect(doneEvents).toEqual([])

    await vi.advanceTimersByTimeAsync(24)
    expect(rendered).toEqual(['ABC'])
    expect(doneEvents).toEqual([])

    await vi.advanceTimersByTimeAsync(24)
    await completion

    expect(rendered).toEqual(['ABC', 'DEF'])
    expect(doneEvents).toEqual([
      {
        type: 'done',
        chat_log_id: 42,
        feedback: 'bad',
        citations: [citation],
      },
    ])
    expect(controller.getSnapshot().timerActive).toBe(false)
  })

  it('renders complete citation markers atomically across render ticks and network chunks', async () => {
    const rendered: string[] = []
    const controller = new ChatStreamController({
      onAppendContent: (text) => rendered.push(text),
      onDone: vi.fn(),
      onError: vi.fn(),
    })
    controller.start()
    controller.handleEvent({ type: 'content_chunk', text: 'AB[12' })
    await vi.advanceTimersByTimeAsync(48)
    expect(rendered).toEqual(['AB'])

    controller.handleEvent({ type: 'content_chunk', text: ']CD[3]E' })
    controller.handleEvent({ type: 'done', chat_log_id: 1, feedback: null })
    const completion = controller.complete()
    await vi.advanceTimersByTimeAsync(72)
    await completion

    expect(rendered).toEqual(['AB', '[12]', 'CD[3]', 'E'])
    expect(controller.getSnapshot().timerActive).toBe(false)
  })

  it.each(['AB[12', 'AB[', 'AB[example]'])('preserves literal or unfinished brackets at completion: %s', async (text) => {
    const rendered: string[] = []
    const controller = new ChatStreamController({
      onAppendContent: (slice) => rendered.push(slice),
      onDone: vi.fn(),
      onError: vi.fn(),
    })
    controller.start()
    controller.handleEvent({ type: 'content_chunk', text })
    await vi.advanceTimersByTimeAsync(96)
    const completion = controller.complete()
    await vi.advanceTimersByTimeAsync(96)
    await completion

    expect(rendered.join('')).toBe(text)
    expect(controller.getSnapshot().timerActive).toBe(false)
  })

  it('stops draining and resolves waiters when an error event arrives', async () => {
    const rendered: string[] = []
    const onError = vi.fn()
    const controller = new ChatStreamController({
      onAppendContent: (text) => rendered.push(text),
      onDone: vi.fn(),
      onError,
    })

    controller.start()
    controller.handleEvent({ type: 'content_chunk', text: 'ABCDEF' })
    const completion = controller.waitForDrainCompletion()
    controller.handleEvent({
      type: 'error',
      code: 'OVER_QUOTA',
      message: 'quota exceeded',
    })

    await completion
    await vi.advanceTimersByTimeAsync(48)

    expect(rendered).toEqual([])
    expect(onError).toHaveBeenCalledWith({
      type: 'error',
      code: 'OVER_QUOTA',
      message: 'quota exceeded',
    })
    expect(controller.getSnapshot().timerActive).toBe(false)
    expect(controller.getSnapshot().queuedContent).toBe('')
  })

  it('ignores progress-only events such as searching', async () => {
    const rendered: string[] = []
    const onError = vi.fn()
    const onDone = vi.fn()
    const controller = new ChatStreamController({
      onAppendContent: (text) => rendered.push(text),
      onDone,
      onError,
    })

    controller.start()
    controller.handleEvent({ type: 'searching', query: 'pgvector' })
    // 未知の種別（API が先にデプロイされた場合）もエラーにしない。
    controller.handleEvent({ type: 'noop' } as unknown as Parameters<
      typeof controller.handleEvent
    >[0])
    controller.handleEvent({ type: 'content_chunk', text: 'ABC' })
    controller.handleEvent({ type: 'done', chat_log_id: 1, feedback: null })

    const completion = controller.complete()
    await vi.advanceTimersByTimeAsync(24)
    await completion

    expect(onError).not.toHaveBeenCalled()
    expect(rendered.join('')).toBe('ABC')
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('cleans up the drain timer on dispose', async () => {
    const rendered: string[] = []
    const controller = new ChatStreamController({
      onAppendContent: (text) => rendered.push(text),
      onDone: vi.fn(),
      onError: vi.fn(),
    })

    controller.start()
    controller.handleEvent({ type: 'content_chunk', text: 'ABCDEF' })

    expect(controller.getSnapshot().timerActive).toBe(true)

    controller.dispose()
    await vi.advanceTimersByTimeAsync(48)

    expect(rendered).toEqual([])
    expect(controller.getSnapshot().timerActive).toBe(false)
  })
})
