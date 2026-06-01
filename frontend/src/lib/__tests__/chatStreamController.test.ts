import {
  ChatStreamController,
  chatStreamReducer,
  createInitialChatStreamState,
} from '@/lib/chatStreamController'
import type { ChatStreamEvent, Citation } from '@/lib/api'

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
    expect(state.errorEvent).toBeNull()
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
    expect(state.errorEvent).toEqual({
      type: 'error',
      code: 'LLM_PROVIDER_ERROR',
      message: 'failed',
    })
  })
})

describe('ChatStreamController', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
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
