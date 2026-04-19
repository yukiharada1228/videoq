import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.unmock('@/lib/api')

import { apiClient } from '../api'

// Helper: build a fake SSE ReadableStream from an array of SSE lines
function makeSSEResponse(lines: string[], status = 200): Response {
  const body = lines.join('\n') + '\n'
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(body))
      controller.close()
    },
  })
  return new Response(stream, {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

// Helper: collect all events from chatStream
async function collectStreamEvents(data: Parameters<typeof apiClient.chatStream>[0]) {
  const events = []
  for await (const event of apiClient.chatStream(data)) {
    events.push(event)
  }
  return events
}

describe('apiClient.chatStream', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // Provide a CSRF token via cookie so ensureCsrfToken resolves quickly
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: 'csrftoken=test-csrf-token',
    })
    ;(apiClient as any).csrfToken = null
    ;(apiClient as any).baseUrl = 'http://localhost:8000/api'
  })

  it('yields content_chunk events from SSE stream', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeSSEResponse([
        'data: {"type":"content_chunk","text":"Hello "}',
        'data: {"type":"content_chunk","text":"World"}',
        'data: {"type":"done","chat_log_id":null,"feedback":null}',
      ]),
    )

    const events = await collectStreamEvents({
      messages: [{ role: 'user', content: 'hi' }],
    })

    const chunks = events.filter((e) => e.type === 'content_chunk')
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toEqual({ type: 'content_chunk', text: 'Hello ' })
    expect(chunks[1]).toEqual({ type: 'content_chunk', text: 'World' })
  })

  it('yields done event with metadata', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeSSEResponse([
        'data: {"type":"content_chunk","text":"Hi"}',
        'data: {"type":"done","chat_log_id":42,"feedback":null}',
      ]),
    )

    const events = await collectStreamEvents({
      messages: [{ role: 'user', content: 'hi' }],
    })

    const done = events.find((e) => e.type === 'done')
    expect(done).toEqual({ type: 'done', chat_log_id: 42, feedback: null })
  })

  it('yields error event from SSE', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeSSEResponse([
        'data: {"type":"error","code":"LLM_CONFIGURATION_ERROR","message":"Invalid API key"}',
      ]),
    )

    const events = await collectStreamEvents({
      messages: [{ role: 'user', content: 'hi' }],
    })

    expect(events[0]).toEqual({
      type: 'error',
      code: 'LLM_CONFIGURATION_ERROR',
      message: 'Invalid API key',
    })
  })

  it('calls correct endpoint for group chat with share_slug', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeSSEResponse(['data: {"type":"done","chat_log_id":null,"feedback":null}']),
    )

    await collectStreamEvents({
      messages: [{ role: 'user', content: 'hi' }],
      share_slug: 'abc123',
    })

    const calledUrl = fetchSpy.mock.calls[0][0] as string
    expect(calledUrl).toContain('/chat/messages/stream/')
    expect(calledUrl).toContain('share_slug=abc123')
  })

  it('throws ApiError on non-200 HTTP response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Bad input' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(collectStreamEvents({
      messages: [{ role: 'user', content: '' }],
    })).rejects.toThrow()
  })

  it('handles chunked SSE delivery across multiple reads', async () => {
    const encoder = new TextEncoder()
    // Split a single SSE line across two reads
    const part1 = 'data: {"type":"content_chunk"'
    const part2 = ',"text":"split"}\ndata: {"type":"done","chat_log_id":null,"feedback":null}\n'

    let readCount = 0
    const stream = new ReadableStream({
      pull(controller) {
        if (readCount === 0) {
          controller.enqueue(encoder.encode(part1))
          readCount++
        } else if (readCount === 1) {
          controller.enqueue(encoder.encode(part2))
          readCount++
        } else {
          controller.close()
        }
      },
    })

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
    )

    const events = await collectStreamEvents({
      messages: [{ role: 'user', content: 'hi' }],
    })

    const chunks = events.filter((e) => e.type === 'content_chunk')
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toEqual({ type: 'content_chunk', text: 'split' })
  })
})
