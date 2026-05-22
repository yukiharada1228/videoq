import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import VideoDetailPage from '../VideoDetailPage'
import { apiClient, ApiError } from '@/lib/api'

const mockVideo = {
  id: 1,
  title: 'Test Video',
  description: 'Test Description',
  status: 'completed',
  file: 'test.mp4',
  source_type: 'uploaded',
  uploaded_at: '2024-01-01T00:00:00Z',
  transcript: '1\n00:00:00,000 --> 00:00:05,000\nHello world',
  tags: [{ id: 1, name: 'Tag1', color: '#FF0000' }],
  error_message: '',
}

const mockLoadVideo = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ id: '1' }),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  }
})

vi.mock('@/hooks/useVideos', () => ({
  useVideo: () => ({
    video: mockVideo,
    isLoading: false,
    error: null,
    loadVideo: mockLoadVideo,
  }),
}))

vi.mock('@/hooks/useTags', () => ({
  useTags: () => ({
    tags: [{ id: 1, name: 'Tag1', color: '#FF0000' }],
    createTag: vi.fn(),
  }),
}))

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    apiClient: {
      getMe: vi.fn(() => Promise.resolve({ id: '1', username: 'testuser', email: 'test@example.com' })),
      updateVideo: vi.fn(),
      deleteVideo: vi.fn(),
      getVideoUrl: vi.fn((url: string) => url),
      addTagsToVideo: vi.fn(),
      removeTagFromVideo: vi.fn(),
    },
  }
})

describe('VideoDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.__setMockLanguage('en')
  })

  it('should render video title', () => {
    render(<VideoDetailPage />)

    expect(screen.getAllByText('Test Video').length).toBeGreaterThan(0)
  })

  it('should render video description', () => {
    render(<VideoDetailPage />)

    expect(screen.getByText('Test Description')).toBeInTheDocument()
  })

  it('should render video status', () => {
    render(<VideoDetailPage />)

    expect(screen.getByText('videos.detail.statusSection')).toBeInTheDocument()
    expect(screen.getByText('common.status.completed')).toBeInTheDocument()
  })

  it('should render edit button', () => {
    render(<VideoDetailPage />)

    expect(screen.getByText('videos.detail.editButton')).toBeInTheDocument()
  })

  it('should render delete button', () => {
    render(<VideoDetailPage />)

    expect(screen.getByText('videos.detail.deleteButton')).toBeInTheDocument()
  })

  it('should render back to list button', () => {
    render(<VideoDetailPage />)

    expect(screen.getByText('videos.detail.videosBreadcrumb')).toBeInTheDocument()
  })

  it('should render transcript when available', () => {
    render(<VideoDetailPage />)

    expect(screen.getByText('videos.detail.transcriptSection')).toBeInTheDocument()
    expect(screen.getByText(/Hello world/)).toBeInTheDocument()
  })

  it('should enter edit mode when edit button is clicked', () => {
    render(<VideoDetailPage />)

    fireEvent.click(screen.getByText('videos.detail.editButton'))

    expect(screen.getByText('videos.detail.save')).toBeInTheDocument()
    expect(screen.getByText('videos.detail.cancel')).toBeInTheDocument()
  })

  it('should not manually load video on mount (query handles initial fetch)', () => {
    render(<VideoDetailPage />)

    expect(mockLoadVideo).not.toHaveBeenCalled()
  })


})

describe('VideoDetailPage - Transcript save error', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should show error message when transcript save returns API error', async () => {
    ;(apiClient.updateVideo as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiError('Transcript must be in valid SRT format.', 'INVALID_SRT_FORMAT'),
    )

    render(<VideoDetailPage />)

    fireEvent.click(screen.getByText('videos.detail.editTranscriptButton'))
    fireEvent.click(screen.getByText('videos.detail.saveTranscriptButton'))

    await waitFor(() => {
      expect(screen.getByText('Transcript must be in valid SRT format.')).toBeInTheDocument()
    })
  })

  it('should clear error message when transcript editing is cancelled', async () => {
    ;(apiClient.updateVideo as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiError('Transcript must be in valid SRT format.', 'INVALID_SRT_FORMAT'),
    )

    render(<VideoDetailPage />)

    fireEvent.click(screen.getByText('videos.detail.editTranscriptButton'))
    fireEvent.click(screen.getByText('videos.detail.saveTranscriptButton'))

    await waitFor(() => {
      expect(screen.getByText('Transcript must be in valid SRT format.')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('videos.detail.cancel'))

    expect(screen.queryByText('Transcript must be in valid SRT format.')).not.toBeInTheDocument()
  })

  it('should clear error message when transcript editing is restarted', async () => {
    ;(apiClient.updateVideo as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiError('Transcript must be in valid SRT format.', 'INVALID_SRT_FORMAT'),
    )

    render(<VideoDetailPage />)

    fireEvent.click(screen.getByText('videos.detail.editTranscriptButton'))
    fireEvent.click(screen.getByText('videos.detail.saveTranscriptButton'))

    await waitFor(() => {
      expect(screen.getByText('Transcript must be in valid SRT format.')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('videos.detail.cancel'))
    fireEvent.click(screen.getByText('videos.detail.editTranscriptButton'))

    expect(screen.queryByText('Transcript must be in valid SRT format.')).not.toBeInTheDocument()
  })
})

describe('VideoDetailPage - Delete', () => {
  it('should call deleteVideo when delete is confirmed', async () => {
    window.confirm = vi.fn(() => true)
      ; (apiClient.deleteVideo as ReturnType<typeof vi.fn>).mockResolvedValue({})

    render(<VideoDetailPage />)

    const deleteButton = screen.getByText('videos.detail.deleteButton')
    fireEvent.click(deleteButton)

    await waitFor(() => {
      expect(apiClient.deleteVideo).toHaveBeenCalledWith(1)
    })
  })
})
