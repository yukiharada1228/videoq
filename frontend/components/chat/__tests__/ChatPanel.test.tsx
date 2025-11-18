import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { ChatPanel } from '../ChatPanel'
import { apiClient } from '@/lib/api'

// Mock apiClient
jest.mock('@/lib/api', () => ({
  apiClient: {
    chat: jest.fn(),
    getChatHistory: jest.fn(),
    exportChatHistoryCsv: jest.fn(),
    setChatFeedback: jest.fn(),
  },
}))

// Mock window.open
const mockOpen = jest.fn()
window.open = mockOpen

describe('ChatPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(apiClient.chat as jest.Mock).mockResolvedValue({
      role: 'assistant',
      content: 'Test response',
      related_videos: [],
      chat_log_id: 1,
      feedback: null,
    })
  })

  it('should render greeting message', () => {
    render(<ChatPanel hasApiKey={true} />)
    
    expect(screen.getByText(/chat.assistantGreeting/)).toBeInTheDocument()
  })

  it('should display no API key message when hasApiKey is false', () => {
    render(<ChatPanel hasApiKey={false} />)
    
    expect(screen.getByText(/common.messages.noApiKey/)).toBeInTheDocument()
  })

  it('should send message when form is submitted', async () => {
    render(<ChatPanel hasApiKey={true} />)
    
    const input = screen.getByPlaceholderText(/chat.placeholder/)
    const sendButton = screen.getByText(/common.actions.send/)

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test message' } })
      fireEvent.click(sendButton)
    })

    await waitFor(() => {
      expect(apiClient.chat).toHaveBeenCalled()
    })
  })

  it('should not send message when input is empty', async () => {
    render(<ChatPanel hasApiKey={true} />)
    
    const sendButton = screen.getByText(/common.actions.send/)

    await act(async () => {
      fireEvent.click(sendButton)
    })

    expect(apiClient.chat).not.toHaveBeenCalled()
  })

  it('should open history when history button is clicked', async () => {
    ;(apiClient.getChatHistory as jest.Mock).mockResolvedValue([])
    
    render(<ChatPanel hasApiKey={true} groupId={1} />)
    
    const historyButton = screen.getByText(/chat.history/)
    
    await act(async () => {
      fireEvent.click(historyButton)
    })

    await waitFor(() => {
      expect(apiClient.getChatHistory).toHaveBeenCalledWith(1)
    })
  })

  it('should not show history button when shareToken is provided', () => {
    render(<ChatPanel hasApiKey={true} groupId={1} shareToken="token123" />)
    
    expect(screen.queryByText(/chat.history/)).not.toBeInTheDocument()
  })

  it('should handle video navigation', async () => {
    const onVideoPlay = jest.fn()
    ;(apiClient.chat as jest.Mock).mockResolvedValue({
      role: 'assistant',
      content: 'Response',
      related_videos: [
        {
          video_id: 1,
          title: 'Test Video',
          start_time: '00:01:30',
        },
      ],
      chat_log_id: 1,
      feedback: null,
    })

    render(<ChatPanel hasApiKey={true} onVideoPlay={onVideoPlay} />)
    
    const input = screen.getByPlaceholderText(/chat.placeholder/)
    const sendButton = screen.getByText(/common.actions.send/)

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test' } })
      fireEvent.click(sendButton)
    })

    await waitFor(() => {
      expect(screen.getByText('Test Video')).toBeInTheDocument()
    })

    const videoCard = screen.getByText('Test Video').closest('div')
    if (videoCard) {
      await act(async () => {
        fireEvent.click(videoCard)
      })
      expect(onVideoPlay).toHaveBeenCalledWith(1, '00:01:30')
    }
  })

  it('should open video in new tab when onVideoPlay is not provided', async () => {
    ;(apiClient.chat as jest.Mock).mockResolvedValue({
      role: 'assistant',
      content: 'Response',
      related_videos: [
        {
          video_id: 1,
          title: 'Test Video',
          start_time: '00:01:30',
        },
      ],
      chat_log_id: 1,
      feedback: null,
    })

    render(<ChatPanel hasApiKey={true} />)
    
    const input = screen.getByPlaceholderText(/chat.placeholder/)
    const sendButton = screen.getByText(/common.actions.send/)

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test' } })
      fireEvent.click(sendButton)
    })

    await waitFor(() => {
      expect(screen.getByText('Test Video')).toBeInTheDocument()
    })

    const videoCard = screen.getByText('Test Video').closest('div')
    if (videoCard) {
      await act(async () => {
        fireEvent.click(videoCard)
      })
      expect(mockOpen).toHaveBeenCalledWith('/videos/1?t=90', '_blank')
    }
  })

  it('should send message when Enter key is pressed', async () => {
    render(<ChatPanel hasApiKey={true} />)
    
    const input = screen.getByPlaceholderText(/chat.placeholder/)

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test message' } })
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: false })
    })

    await waitFor(() => {
      expect(apiClient.chat).toHaveBeenCalled()
    })
  })

  it('should not send message when Shift+Enter is pressed', async () => {
    render(<ChatPanel hasApiKey={true} />)
    
    const input = screen.getByPlaceholderText(/chat.placeholder/)

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test message' } })
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    })

    expect(apiClient.chat).not.toHaveBeenCalled()
  })

  it('should handle feedback good button click', async () => {
    ;(apiClient.chat as jest.Mock).mockResolvedValue({
      role: 'assistant',
      content: 'Response',
      related_videos: [],
      chat_log_id: 1,
      feedback: null,
    })
    ;(apiClient.setChatFeedback as jest.Mock).mockResolvedValue({
      chat_log_id: 1,
      feedback: 'good',
    })

    render(<ChatPanel hasApiKey={true} />)
    
    const input = screen.getByPlaceholderText(/chat.placeholder/)
    const sendButton = screen.getByText(/common.actions.send/)

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test' } })
      fireEvent.click(sendButton)
    })

    await waitFor(() => {
      expect(screen.getByText(/chat.feedbackGood/)).toBeInTheDocument()
    })

    const goodButton = screen.getByText(/chat.feedbackGood/)
    await act(async () => {
      fireEvent.click(goodButton)
    })

    await waitFor(() => {
      expect(apiClient.setChatFeedback).toHaveBeenCalledWith(1, 'good', undefined)
    })
  })

  it('should handle feedback bad button click', async () => {
    ;(apiClient.chat as jest.Mock).mockResolvedValue({
      role: 'assistant',
      content: 'Response',
      related_videos: [],
      chat_log_id: 1,
      feedback: null,
    })
    ;(apiClient.setChatFeedback as jest.Mock).mockResolvedValue({
      chat_log_id: 1,
      feedback: 'bad',
    })

    render(<ChatPanel hasApiKey={true} />)
    
    const input = screen.getByPlaceholderText(/chat.placeholder/)
    const sendButton = screen.getByText(/common.actions.send/)

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test' } })
      fireEvent.click(sendButton)
    })

    await waitFor(() => {
      expect(screen.getByText(/chat.feedbackBad/)).toBeInTheDocument()
    })

    const badButton = screen.getByText(/chat.feedbackBad/)
    await act(async () => {
      fireEvent.click(badButton)
    })

    await waitFor(() => {
      expect(apiClient.setChatFeedback).toHaveBeenCalledWith(1, 'bad', undefined)
    })
  })

  it('should toggle feedback when clicking same button', async () => {
    ;(apiClient.chat as jest.Mock).mockResolvedValue({
      role: 'assistant',
      content: 'Response',
      related_videos: [],
      chat_log_id: 1,
      feedback: 'good',
    })
    ;(apiClient.setChatFeedback as jest.Mock).mockResolvedValue({
      chat_log_id: 1,
      feedback: null,
    })

    render(<ChatPanel hasApiKey={true} />)
    
    const input = screen.getByPlaceholderText(/chat.placeholder/)
    const sendButton = screen.getByText(/common.actions.send/)

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test' } })
      fireEvent.click(sendButton)
    })

    await waitFor(() => {
      expect(screen.getByText(/chat.feedbackGood/)).toBeInTheDocument()
    })

    const goodButton = screen.getByText(/chat.feedbackGood/)
    await act(async () => {
      fireEvent.click(goodButton)
    })

    await waitFor(() => {
      expect(apiClient.setChatFeedback).toHaveBeenCalledWith(1, null, undefined)
    })
  })

  it('should display history when opened', async () => {
    const mockHistory = [
      {
        id: 1,
        group: 1,
        question: 'Test question',
        answer: 'Test answer',
        related_videos: [],
        is_shared_origin: false,
        created_at: '2024-01-15T10:00:00Z',
        feedback: null,
      },
    ]
    ;(apiClient.getChatHistory as jest.Mock).mockResolvedValue(mockHistory)
    
    render(<ChatPanel hasApiKey={true} groupId={1} />)
    
    const historyButton = screen.getByText(/chat.history/)
    
    await act(async () => {
      fireEvent.click(historyButton)
    })

    await waitFor(() => {
      expect(screen.getByText('Test question')).toBeInTheDocument()
      expect(screen.getByText('Test answer')).toBeInTheDocument()
    })
  })

  it('should close history when close button is clicked', async () => {
    ;(apiClient.getChatHistory as jest.Mock).mockResolvedValue([])
    
    render(<ChatPanel hasApiKey={true} groupId={1} />)
    
    const historyButton = screen.getByText(/chat.history/)
    
    await act(async () => {
      fireEvent.click(historyButton)
    })

    await waitFor(() => {
      expect(screen.getByText(/chat.close/)).toBeInTheDocument()
    })

    const closeButton = screen.getByText(/chat.close/)
    await act(async () => {
      fireEvent.click(closeButton)
    })

    await waitFor(() => {
      expect(screen.queryByText(/chat.close/)).not.toBeInTheDocument()
    })
  })

  it('should export CSV when export button is clicked', async () => {
    const mockHistory = [
      {
        id: 1,
        group: 1,
        question: 'Test question',
        answer: 'Test answer',
        related_videos: [],
        is_shared_origin: false,
        created_at: '2024-01-15T10:00:00Z',
        feedback: null,
      },
    ]
    ;(apiClient.getChatHistory as jest.Mock).mockResolvedValue(mockHistory)
    ;(apiClient.exportChatHistoryCsv as jest.Mock).mockResolvedValue(undefined)
    
    render(<ChatPanel hasApiKey={true} groupId={1} />)
    
    const historyButton = screen.getByText(/chat.history/)
    
    await act(async () => {
      fireEvent.click(historyButton)
    })

    await waitFor(() => {
      expect(screen.getByText('Test question')).toBeInTheDocument()
    })

    // Wait for history to load and export button to appear
    // The button contains both chat.exportCsv and chat.exportCsvShort spans
    await waitFor(() => {
      const buttons = screen.getAllByText(/chat.exportCsv/)
      expect(buttons.length).toBeGreaterThan(0)
    })

    // Get the button element (parent of the span)
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
    ;(apiClient.chat as jest.Mock).mockRejectedValue(new Error('Chat failed'))

    render(<ChatPanel hasApiKey={true} />)
    
    const input = screen.getByPlaceholderText(/chat.placeholder/)
    const sendButton = screen.getByText(/common.actions.send/)

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test message' } })
      fireEvent.click(sendButton)
    })

    await waitFor(() => {
      expect(screen.getByText(/chat.error/)).toBeInTheDocument()
    })
  })

  it('should handle history loading state', async () => {
    ;(apiClient.getChatHistory as jest.Mock).mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve([]), 100))
    )
    
    render(<ChatPanel hasApiKey={true} groupId={1} />)
    
    const historyButton = screen.getByText(/chat.history/)
    
    await act(async () => {
      fireEvent.click(historyButton)
    })

    expect(screen.getByText(/chat.historyLoading/)).toBeInTheDocument()
  })

  it('should handle getChatHistory error', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    ;(apiClient.getChatHistory as jest.Mock).mockRejectedValue(new Error('Failed to load history'))
    
    render(<ChatPanel hasApiKey={true} groupId={1} />)
    
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
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const mockHistory = [
      {
        id: 1,
        group: 1,
        question: 'Test question',
        answer: 'Test answer',
        related_videos: [],
        is_shared_origin: false,
        created_at: '2024-01-15T10:00:00Z',
        feedback: null,
      },
    ]
    ;(apiClient.getChatHistory as jest.Mock).mockResolvedValue(mockHistory)
    ;(apiClient.exportChatHistoryCsv as jest.Mock).mockRejectedValue(new Error('Failed to export CSV'))
    
    render(<ChatPanel hasApiKey={true} groupId={1} />)
    
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
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    ;(apiClient.chat as jest.Mock).mockResolvedValue({
      role: 'assistant',
      content: 'Response',
      related_videos: [],
      chat_log_id: 1,
      feedback: null,
    })
    ;(apiClient.setChatFeedback as jest.Mock).mockRejectedValue(new Error('Failed to update feedback'))

    render(<ChatPanel hasApiKey={true} />)
    
    const input = screen.getByPlaceholderText(/chat.placeholder/)
    const sendButton = screen.getByText(/common.actions.send/)

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test' } })
      fireEvent.click(sendButton)
    })

    await waitFor(() => {
      expect(screen.getByText(/chat.feedbackGood/)).toBeInTheDocument()
    })

    const goodButton = screen.getByText(/chat.feedbackGood/)
    await act(async () => {
      fireEvent.click(goodButton)
    })

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to update feedback', expect.any(Error))
    })

    consoleErrorSpy.mockRestore()
  })

  it('should not send message when Enter key is pressed during composition', async () => {
    render(<ChatPanel hasApiKey={true} />)
    
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
    expect(apiClient.chat).not.toHaveBeenCalled()
  })

  it('should display related videos in history', async () => {
    const mockHistory = [
      {
        id: 1,
        group: 1,
        question: 'Test question',
        answer: 'Test answer',
        related_videos: [
          {
            video_id: 1,
            title: 'History Video',
            start_time: '00:02:00',
          },
        ],
        is_shared_origin: false,
        created_at: '2024-01-15T10:00:00Z',
        feedback: null,
      },
    ]
    ;(apiClient.getChatHistory as jest.Mock).mockResolvedValue(mockHistory)
    
    render(<ChatPanel hasApiKey={true} groupId={1} />)
    
    const historyButton = screen.getByText(/chat.history/)
    
    await act(async () => {
      fireEvent.click(historyButton)
    })

    await waitFor(() => {
      expect(screen.getByText('Test question')).toBeInTheDocument()
    })

    // Check for related video content (title and time are in the same element)
    const relatedVideoElement = screen.getByText(/History Video/)
    expect(relatedVideoElement).toBeInTheDocument()
    expect(relatedVideoElement.textContent).toContain('00:02:00')
  })
})

