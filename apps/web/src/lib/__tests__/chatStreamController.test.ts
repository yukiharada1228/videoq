import { ChatStreamController, chatStreamReducer, createInitialChatStreamState } from '@/lib/chatStreamController'
import { applyChatPart, type ChatAnswer, type ChatContentPart } from '@videoq/trpc/chat'

const source = { id: 1, video_id: 10, title: 'Video', start_time: '00:00:05', end_time: '00:00:10' }
const done = { type: 'done' as const, chat_log_id: 99, feedback: null }

describe('structured answer render queue', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  it('coalesces text only within the same segment and delays completion until rendered', async () => {
    const answer: ChatAnswer = { segments: [], sources: [source] }
    const snapshots: ChatContentPart[][] = []
    const onDone = vi.fn()
    const controller = new ChatStreamController({ onAppendParts: parts => {
      snapshots.push(parts)
      parts.forEach(part => applyChatPart(answer, part))
    }, onDone, onError: vi.fn() })
    controller.start()
    controller.handleEvent({ type: 'source', source })
    controller.handleEvent({ type: 'text_delta', segmentIndex: 0, text: 'AB' })
    controller.handleEvent({ type: 'citation', segmentIndex: 0, sourceId: 1 })
    controller.handleEvent({ type: 'text_delta', segmentIndex: 1, text: 'CDEF' })
    controller.handleEvent(done)
    const complete = controller.complete()
    await vi.advanceTimersByTimeAsync(24)
    expect(onDone).not.toHaveBeenCalled()
    expect(snapshots[0]).toEqual([
      { type: 'text', segmentIndex: 0, text: 'AB' },
      { type: 'citation', segmentIndex: 0, sourceId: 1 },
      { type: 'text', segmentIndex: 1, text: 'C' },
    ])
    await vi.advanceTimersByTimeAsync(24)
    await complete
    expect(answer.segments).toEqual([{ text: 'AB', sourceIds: [1] }, { text: 'CDEF', sourceIds: [] }])
    expect(onDone).toHaveBeenCalledExactlyOnceWith(done)
    expect(controller.getSnapshot().timerActive).toBe(false)
  })
  it('renders literal brackets immediately and never splits an emoji', async () => {
    const rendered: ChatContentPart[][] = []
    const controller = new ChatStreamController({ charsPerTick: 1, onAppendParts: p => rendered.push(p), onDone: vi.fn(), onError: vi.fn() })
    controller.start()
    controller.handleEvent({ type: 'text_delta', segmentIndex: 0, text: '[1]🙂' })
    await vi.advanceTimersByTimeAsync(96)
    expect(rendered.map(p => p[0].type === 'text' ? p[0].text : '')).toEqual(['[', '1', ']', '🙂'])
    controller.dispose()
  })
  it('preserves empty segments and resolves completion on an empty queue', async () => {
    const append = vi.fn()
    const onDone = vi.fn()
    const controller = new ChatStreamController({ onAppendParts: append, onDone, onError: vi.fn() })
    controller.start()
    controller.handleEvent({ type: 'text_delta', segmentIndex: 0, text: '' })
    controller.handleEvent(done)
    await vi.advanceTimersByTimeAsync(24)
    await controller.complete()
    expect(append).toHaveBeenCalledWith([{ type: 'text', segmentIndex: 0, text: '' }])
    expect(onDone).toHaveBeenCalledOnce()
  })
  it.each(['error', 'abort', 'restart', 'dispose'])('clears queued text and pending completion on %s', async action => {
    const append = vi.fn(), onDone = vi.fn(), onError = vi.fn()
    const controller = new ChatStreamController({ onAppendParts: append, onDone, onError })
    controller.start()
    controller.handleEvent({ type: 'text_delta', segmentIndex: 0, text: 'old content' })
    if (action === 'error') controller.handleEvent({ type: 'error', code: 'FAILED', message: 'failed' })
    else if (action === 'abort') controller.abort()
    else if (action === 'restart') controller.start()
    else controller.dispose()
    await vi.advanceTimersByTimeAsync(100)
    expect(append).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
    expect(controller.getSnapshot().queuedParts).toEqual([])
    expect(controller.getSnapshot().timerActive).toBe(false)
  })
  it('ignores non-content progress in the render queue', () => {
    const initial = createInitialChatStreamState()
    expect(chatStreamReducer(initial, { type: 'stream_event', event: { type: 'source', source } })).toBe(initial)
    expect(chatStreamReducer(initial, { type: 'stream_event', event: { type: 'searching', search_id: 1, query: 'query' } })).toBe(initial)
  })
})
