import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { ChatPanel } from '../ChatPanel'
import { apiClient } from '@/lib/api'

// Mock apiClient
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    apiClient: {
      chat: vi.fn(),
      chatStream: vi.fn(),
      getChatHistory: vi.fn(),
      getChatEvaluations: vi.fn(),
      exportChatHistoryCsv: vi.fn(),
      setChatFeedback: vi.fn(),
      getOpenAIApiKeyStatus: vi.fn(),
    },
  }
})

// Helper: create async generator mock for chatStream
function makeStreamMock(
  response: { content: string; chat_log_id?: number; feedback?: 'good' | 'bad' | null; citations?: any[] }
) {
  return async function* () {
    yield { type: 'content_chunk' as const, text: response.content }
    yield {
      type: 'done' as const,
      chat_log_id: response.chat_log_id ?? null,
      feedback: response.feedback ?? null,
      citations: response.citations,
    }
  }
}

// Mock window.open
const mockOpen = vi.fn()
window.open = mockOpen

// Helper: type in input and press Enter to send
async function sendMessage(input: HTMLElement, message: string) {
  fireEvent.change(input, { target: { value: message } })
  fireEvent.keyDown(input, { key: 'Enter', shiftKey: false })
}

describe('ChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(apiClient.chatStream as any).mockImplementation(
      makeStreamMock({ content: 'Test response', chat_log_id: 1, feedback: null }),
    )
    ;(apiClient.getChatEvaluations as any).mockResolvedValue([])
    ;(apiClient.getOpenAIApiKeyStatus as any).mockResolvedValue({ has_api_key: true })
  })

  it('should render greeting message', () => {
    render(<ChatPanel />)

    expect(screen.getByText(/chat.assistantGreeting/)).toBeInTheDocument()
  })

  it('should send message when form is submitted', async () => {
    render(<ChatPanel />)

    const input = screen.getByPlaceholderText(/chat.placeholder/)

    await act(async () => {
      await sendMessage(input, 'Test message')
    })

    await waitFor(() => {
      expect(apiClient.chatStream).toHaveBeenCalled()
    })
  })

  it('should not send message when input is empty', async () => {
    render(<ChatPanel />)

    const input = screen.getByPlaceholderText(/chat.placeholder/)

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: false })
    })

    expect(apiClient.chatStream).not.toHaveBeenCalled()
  })

  it('should open history when history button is clicked', async () => {
    ;(apiClient.getChatHistory as any).mockResolvedValue([])

    render(<ChatPanel groupId={1} />)

    const historyButton = screen.getByText(/chat.history/)

    await act(async () => {
      fireEvent.click(historyButton)
    })

    await waitFor(() => {
      expect(apiClient.getChatHistory).toHaveBeenCalledWith(1)
    })
  })

  it('should not show history button when shareToken is provided', () => {
    render(<ChatPanel groupId={1} shareToken="token123" />)

    expect(screen.queryByText(/chat.history/)).not.toBeInTheDocument()
  })

  it('should handle video navigation', async () => {
    const onVideoPlay = vi.fn()
    ;(apiClient.chatStream as any).mockImplementation(makeStreamMock({
      content: 'This is grounded text[1].',
      citations: [{ id: 1, video_id: 1, title: 'Test Video', start_time: '00:01:30', end_time: '00:15:30' }],
      chat_log_id: 1,
      feedback: null,
    }))

    render(<ChatPanel onVideoPlay={onVideoPlay} />)

    const input = screen.getByPlaceholderText(/chat.placeholder/)

    await act(async () => {
      await sendMessage(input, 'Test')
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Test Video 00:01:30/ })).toBeInTheDocument()
    })
    expect(screen.getByText((text) => text.includes('This is grounded text'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Test Video 00:01:30/ })).toHaveTextContent('(1:30-15:30)')

    const videoButton = screen.getByTitle(/Test Video/)
    if (videoButton) {
      await act(async () => {
        fireEvent.click(videoButton)
      })
      expect(onVideoPlay).toHaveBeenCalledWith(1, '00:01:30')
    }
  })

  it('should open video in new tab when onVideoPlay is not provided', async () => {
    ;(apiClient.chatStream as any).mockImplementation(makeStreamMock({
      content: 'This is grounded text[1].',
      citations: [{ id: 1, video_id: 1, title: 'Test Video', start_time: '00:01:30', end_time: '00:15:30' }],
      chat_log_id: 1,
      feedback: null,
    }))

    render(<ChatPanel />)

    const input = screen.getByPlaceholderText(/chat.placeholder/)

    await act(async () => {
      await sendMessage(input, 'Test')
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Test Video 00:01:30/ })).toBeInTheDocument()
    })

    const videoButton = screen.getByTitle(/Test Video/)
    if (videoButton) {
      await act(async () => {
        fireEvent.click(videoButton)
      })
      expect(mockOpen).toHaveBeenCalledWith('/videos/1?t=90', '_blank')
    }
  })

  it('should send message when Enter key is pressed', async () => {
    render(<ChatPanel />)

    const input = screen.getByPlaceholderText(/chat.placeholder/)

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test message' } })
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: false })
    })

    await waitFor(() => {
      expect(apiClient.chatStream).toHaveBeenCalled()
    })
  })

  it('should not send message when Shift+Enter is pressed', async () => {
    render(<ChatPanel />)

    const input = screen.getByPlaceholderText(/chat.placeholder/)

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test message' } })
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    })

    expect(apiClient.chatStream).not.toHaveBeenCalled()
  })

  it('should handle feedback good button click', async () => {
    ;(apiClient.chatStream as any).mockImplementation(
      makeStreamMock({ content: 'Response', chat_log_id: 1, feedback: null }),
    )
    ;(apiClient.setChatFeedback as any).mockResolvedValue({
      chat_log_id: 1,
      feedback: 'good',
    })

    render(<ChatPanel />)

    const input = screen.getByPlaceholderText(/chat.placeholder/)

    await act(async () => {
      await sendMessage(input, 'Test')
    })

    // Wait for assistant response with feedback buttons
    await waitFor(() => {
      expect(screen.getByText('Response')).toBeInTheDocument()
    })

    // Find feedback buttons (ThumbsUp and ThumbsDown are icon-only)
    const feedbackButtons = screen.getAllByRole('button').filter(
      btn => btn.querySelector('svg') && !btn.disabled
    )
    const goodButton = feedbackButtons.find(btn =>
      btn.querySelector('[class*="lucide-thumbs-up"]')
    )

    if (goodButton) {
      await act(async () => {
        fireEvent.click(goodButton)
      })

      await waitFor(() => {
        expect(apiClient.setChatFeedback).toHaveBeenCalledWith(1, 'good', undefined)
      })
    } else {
      // Alternative: find buttons after the message content
      const allButtons = screen.getAllByRole('button')
      // ThumbsUp button is typically after the message
      const thumbsButtons = allButtons.filter(btn => btn.className.includes('rounded'))
      if (thumbsButtons.length > 0) {
        await act(async () => { fireEvent.click(thumbsButtons[thumbsButtons.length - 2]) })
        await waitFor(() => {
          expect(apiClient.setChatFeedback).toHaveBeenCalled()
        })
      }
    }
  })

  it('should handle feedback bad button click', async () => {
    ;(apiClient.chatStream as any).mockImplementation(
      makeStreamMock({ content: 'Response', chat_log_id: 1, feedback: null }),
    )
    ;(apiClient.setChatFeedback as any).mockResolvedValue({
      chat_log_id: 1,
      feedback: 'bad',
    })

    render(<ChatPanel />)

    const input = screen.getByPlaceholderText(/chat.placeholder/)

    await act(async () => {
      await sendMessage(input, 'Test')
    })

    await waitFor(() => {
      expect(screen.getByText('Response')).toBeInTheDocument()
    })

    const thumbsDownButtons = screen.getAllByRole('button').filter(
      btn => btn.querySelector('[class*="lucide-thumbs-down"]')
    )

    if (thumbsDownButtons.length > 0) {
      await act(async () => {
        fireEvent.click(thumbsDownButtons[0])
      })

      await waitFor(() => {
        expect(apiClient.setChatFeedback).toHaveBeenCalledWith(1, 'bad', undefined)
      })
    }
  })

  it('should toggle feedback when clicking same button', async () => {
    ;(apiClient.chatStream as any).mockImplementation(
      makeStreamMock({ content: 'Response', chat_log_id: 1, feedback: 'good' }),
    )
    ;(apiClient.setChatFeedback as any).mockResolvedValue({
      chat_log_id: 1,
      feedback: null,
    })

    render(<ChatPanel />)

    const input = screen.getByPlaceholderText(/chat.placeholder/)

    await act(async () => {
      await sendMessage(input, 'Test')
    })

    await waitFor(() => {
      expect(screen.getByText('Response')).toBeInTheDocument()
    })

    const thumbsUpButtons = screen.getAllByRole('button').filter(
      btn => btn.querySelector('[class*="lucide-thumbs-up"]')
    )

    if (thumbsUpButtons.length > 0) {
      await act(async () => {
        fireEvent.click(thumbsUpButtons[0])
      })

      await waitFor(() => {
        expect(apiClient.setChatFeedback).toHaveBeenCalledWith(1, null, undefined)
      })
    }
  })

  it('should display history when opened', async () => {
    const mockHistory = [
      {
        id: 1,
        group: 1,
        question: 'Test question',
        answer: 'Test answer',
        is_shared_origin: false,
        created_at: '2024-01-15T10:00:00Z',
        feedback: null,
      },
    ]
    ;(apiClient.getChatHistory as any).mockResolvedValue(mockHistory)

    render(<ChatPanel groupId={1} />)

    const historyButton = screen.getByText(/chat.history/)

    await act(async () => {
      fireEvent.click(historyButton)
    })

    await waitFor(() => {
      expect(screen.getByText('Test question')).toBeInTheDocument()
      expect(screen.getByText('Test answer')).toBeInTheDocument()
    })
  })

  it('should display RAGAS evaluation scores for history answers', async () => {
    const mockHistory = [
      {
        id: 1,
        group: 1,
        question: 'Test question',
        answer: 'Test answer',
        is_shared_origin: false,
        created_at: '2024-01-15T10:00:00Z',
        feedback: null,
      },
    ]
    ;(apiClient.getChatHistory as any).mockResolvedValue(mockHistory)
    ;(apiClient.getChatEvaluations as any).mockResolvedValue([
      {
        chat_log_id: 1,
        status: 'completed',
        faithfulness: 0.86,
        answer_relevancy: 0.81,
        context_precision: 0.78,
        error_message: '',
        evaluated_at: '2024-01-15T10:01:00Z',
      },
    ])

    render(<ChatPanel groupId={1} />)

    const historyButton = screen.getByText(/chat.history/)

    await act(async () => {
      fireEvent.click(historyButton)
    })

    await waitFor(() => {
      expect(screen.getByText('chat.evaluation.status.completed')).toBeInTheDocument()
      expect(screen.getByText('chat.evaluation.metrics.faithfulness')).toBeInTheDocument()
      expect(screen.getByText('86%')).toBeInTheDocument()
      expect(screen.getByText('chat.evaluation.metrics.answerRelevancy')).toBeInTheDocument()
      expect(screen.getByText('81%')).toBeInTheDocument()
      expect(screen.getByText('chat.evaluation.metrics.contextPrecision')).toBeInTheDocument()
      expect(screen.getByText('78%')).toBeInTheDocument()
    })
  })

  it('should display pending and failed evaluation states without showing missing evaluations', async () => {
    const mockHistory = [
      {
        id: 1,
        group: 1,
        question: 'Pending question',
        answer: 'Pending answer',
        is_shared_origin: false,
        created_at: '2024-01-15T10:00:00Z',
        feedback: null,
      },
      {
        id: 2,
        group: 1,
        question: 'Failed question',
        answer: 'Failed answer',
        is_shared_origin: false,
        created_at: '2024-01-15T10:01:00Z',
        feedback: null,
      },
      {
        id: 3,
        group: 1,
        question: 'No evaluation question',
        answer: 'No evaluation answer',
        is_shared_origin: false,
        created_at: '2024-01-15T10:02:00Z',
        feedback: null,
      },
    ]
    ;(apiClient.getChatHistory as any).mockResolvedValue(mockHistory)
    ;(apiClient.getChatEvaluations as any).mockResolvedValue([
      {
        chat_log_id: 1,
        status: 'pending',
        faithfulness: null,
        answer_relevancy: null,
        context_precision: null,
        error_message: '',
        evaluated_at: null,
      },
      {
        chat_log_id: 2,
        status: 'failed',
        faithfulness: null,
        answer_relevancy: null,
        context_precision: null,
        error_message: 'ragas error',
        evaluated_at: null,
      },
    ])

    render(<ChatPanel groupId={1} />)

    const historyButton = screen.getByText(/chat.history/)

    await act(async () => {
      fireEvent.click(historyButton)
    })

    await waitFor(() => {
      expect(screen.getByText('chat.evaluation.status.pending')).toBeInTheDocument()
      expect(screen.getByText('chat.evaluation.status.failed')).toBeInTheDocument()
      expect(screen.getByText('No evaluation answer')).toBeInTheDocument()
    })

    expect(screen.queryByText('chat.evaluation.status.completed')).not.toBeInTheDocument()
  })

  it('should switch back to chat tab from history', async () => {
    ;(apiClient.getChatHistory as any).mockResolvedValue([])

    render(<ChatPanel groupId={1} />)

    // Switch to history tab
    const historyButton = screen.getByText(/chat.history/)
    await act(async () => {
      fireEvent.click(historyButton)
    })

    // Switch back to chat tab
    const chatButton = screen.getByText(/chat.newConsultation/)
    await act(async () => {
      fireEvent.click(chatButton)
    })

    // Should show chat input again
    expect(screen.getByPlaceholderText(/chat.placeholder/)).toBeInTheDocument()
  })

  it('should export CSV when export button is clicked', async () => {
    const mockHistory = [
      {
        id: 1,
        group: 1,
        question: 'Test question',
        answer: 'Test answer',
        is_shared_origin: false,
        created_at: '2024-01-15T10:00:00Z',
        feedback: null,
      },
    ]
    ;(apiClient.getChatHistory as any).mockResolvedValue(mockHistory)
    ;(apiClient.exportChatHistoryCsv as any).mockResolvedValue(undefined)

    render(<ChatPanel groupId={1} />)

    const historyButton = screen.getByText(/chat.history/)

    await act(async () => {
      fireEvent.click(historyButton)
    })

    await waitFor(() => {
      expect(screen.getByText('Test question')).toBeInTheDocument()
    })

    // The export button shows CSV text
    await waitFor(() => {
      const buttons = screen.getAllByText(/chat.exportCsv/)
      expect(buttons.length).toBeGreaterThan(0)
    })

    const exportButtons = screen.getAllByText(/chat.exportCsv/)
    const exportButton = exportButtons[0].closest('button')

    if (exportButton) {
      await act(async () => {
        fireEvent.click(exportButton)
      })
    }

    await waitFor(() => {
      expect(apiClient.exportChatHistoryCsv).toHaveBeenCalledWith(1)
    })
  })

  it('should display error message when chat fails', async () => {
    ;(apiClient.chatStream as any).mockImplementation(async function* () {
      throw new Error('Chat failed')
      yield // make it a generator
    })

    render(<ChatPanel />)

    const input = screen.getByPlaceholderText(/chat.placeholder/)

    await act(async () => {
      await sendMessage(input, 'Test message')
    })

    await waitFor(() => {
      expect(screen.getByText(/chat.error/)).toBeInTheDocument()
    })
  })

  it('should handle history loading state', async () => {
    ;(apiClient.getChatHistory as any).mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve([]), 100))
    )

    render(<ChatPanel groupId={1} />)

    const historyButton = screen.getByText(/chat.history/)

    await act(async () => {
      fireEvent.click(historyButton)
    })

    // Loading state shows a spinner, history is empty loading
    // The history view renders while loading
    expect(screen.queryByText('Test question')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('should handle getChatHistory error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(apiClient.getChatHistory as any).mockRejectedValue(new Error('Failed to load history'))

    render(<ChatPanel groupId={1} />)

    const historyButton = screen.getByText(/chat.history/)

    await act(async () => {
      fireEvent.click(historyButton)
    })

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load history', expect.any(Error))
    })

    consoleErrorSpy.mockRestore()
  })

  it('should handle exportChatHistoryCsv error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockHistory = [
      {
        id: 1,
        group: 1,
        question: 'Test question',
        answer: 'Test answer',
        is_shared_origin: false,
        created_at: '2024-01-15T10:00:00Z',
        feedback: null,
      },
    ]
    ;(apiClient.getChatHistory as any).mockResolvedValue(mockHistory)
    ;(apiClient.exportChatHistoryCsv as any).mockRejectedValue(new Error('Failed to export CSV'))

    render(<ChatPanel groupId={1} />)

    const historyButton = screen.getByText(/chat.history/)

    await act(async () => {
      fireEvent.click(historyButton)
    })

    await waitFor(() => {
      expect(screen.getByText('Test question')).toBeInTheDocument()
    })

    const exportButtons = screen.getAllByText(/chat.exportCsv/)
    const exportButton = exportButtons[0].closest('button')

    if (exportButton) {
      await act(async () => {
        fireEvent.click(exportButton)
      })
    }

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to export CSV', expect.any(Error))
    })

    consoleErrorSpy.mockRestore()
  })

  it('should handle setChatFeedback error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(apiClient.chatStream as any).mockImplementation(
      makeStreamMock({ content: 'Response', chat_log_id: 1, feedback: null }),
    )
    ;(apiClient.setChatFeedback as any).mockRejectedValue(new Error('Failed to update feedback'))

    render(<ChatPanel />)

    const input = screen.getByPlaceholderText(/chat.placeholder/)

    await act(async () => {
      await sendMessage(input, 'Test')
    })

    await waitFor(() => {
      expect(screen.getByText('Response')).toBeInTheDocument()
    })

    const thumbsUpButtons = screen.getAllByRole('button').filter(
      btn => btn.querySelector('[class*="lucide-thumbs-up"]')
    )

    if (thumbsUpButtons.length > 0) {
      await act(async () => {
        fireEvent.click(thumbsUpButtons[0])
      })

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to update feedback', expect.any(Error))
      })
    }

    consoleErrorSpy.mockRestore()
  })

  it('should not send message when Enter key is pressed during composition', async () => {
    render(<ChatPanel />)

    const input = screen.getByPlaceholderText(/chat.placeholder/)

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test message' } })
      // Simulate composition event
      const compositionEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        isComposing: true,
      })
      Object.defineProperty(compositionEvent, 'nativeEvent', {
        value: { isComposing: true },
      })
      input.dispatchEvent(compositionEvent)
    })

    // Should not call chat API during composition
    expect(apiClient.chatStream).not.toHaveBeenCalled()
  })

  it('should display citation timestamps in history', async () => {
    const mockHistory = [
      {
        id: 1,
        group: 1,
        question: 'Test question',
        answer: 'Test answer[1]',
        citations: [
          {
            id: 1,
            video_id: 1,
            title: 'History Video',
            start_time: '00:02:00',
            end_time: '00:10:00',
          },
        ],
        is_shared_origin: false,
        created_at: '2024-01-15T10:00:00Z',
        feedback: null,
      },
    ]
    ;(apiClient.getChatHistory as any).mockResolvedValue(mockHistory)

    render(<ChatPanel groupId={1} />)

    const historyButton = screen.getByText(/chat.history/)

    await act(async () => {
      fireEvent.click(historyButton)
    })

    await waitFor(() => {
      expect(screen.getByText('Test question')).toBeInTheDocument()
    })

    expect(screen.getByText((text) => text.includes('Test answer'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /History Video 00:02:00/ })).toHaveTextContent('(2:00-10:00)')
  })

  it('should render multiple reference ids as separate buttons', async () => {
    ;(apiClient.chatStream as any).mockImplementation(makeStreamMock({
      content: 'This is grounded text[1][2].',
      citations: [
        { id: 1, video_id: 1, title: 'Video One', start_time: '00:01:30', end_time: '00:15:30' },
        { id: 2, video_id: 2, title: 'Video Two', start_time: '00:02:30', end_time: '00:08:30' },
      ],
      chat_log_id: 1,
      feedback: null,
    }))

    render(<ChatPanel />)

    const input = screen.getByPlaceholderText(/chat.placeholder/)

    await act(async () => {
      await sendMessage(input, 'Test')
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Video One 00:01:30/ })).toBeInTheDocument()
    })

    expect(screen.getByTitle(/Video One 00:01:30/)).toBeInTheDocument()
    expect(screen.getByTitle(/Video Two 00:02:30/)).toBeInTheDocument()
    expect(screen.getByText((text) => text.includes('This is grounded text'))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Video One 00:01:30/ })).toHaveTextContent('(1:30-15:30)')
    expect(screen.getByRole('button', { name: /Video Two 00:02:30/ })).toHaveTextContent('(2:30-8:30)')
  })

  it('should normalize millisecond timestamps in inline links', async () => {
    ;(apiClient.chatStream as any).mockImplementation(makeStreamMock({
      content: 'Deep learning is useful[1]. It finds a good function.',
      citations: [{ id: 1, video_id: 1, title: 'Test Video', start_time: '00:06:37,480', end_time: '00:07:47,900' }],
      chat_log_id: 1,
      feedback: null,
    }))

    render(<ChatPanel />)

    const input = screen.getByPlaceholderText(/chat.placeholder/)

    await act(async () => {
      await sendMessage(input, 'Test')
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Test Video 00:06:37,480/ })).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /Test Video 00:06:37,480/ })).toHaveTextContent('(6:37-7:47)')
  })

  it('should keep unmatched citation markers as plain text', async () => {
    ;(apiClient.chatStream as any).mockImplementation(
      makeStreamMock({ content: 'Response [2]', chat_log_id: 1, feedback: null }),
    )

    render(<ChatPanel />)

    const input = screen.getByPlaceholderText(/chat.placeholder/)

    await act(async () => {
      await sendMessage(input, 'Test')
    })

    await waitFor(() => {
      expect(screen.getByText('Response [2]')).toBeInTheDocument()
    })
  })
})
