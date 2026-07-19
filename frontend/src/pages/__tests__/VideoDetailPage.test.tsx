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
  tags: [{ id: 1, name: 'Tag1', color: 'red' }],
  error_message: '',
}

const mockLoadVideo = vi.fn()

let mockUseVideoReturn = {
  video: mockVideo as typeof mockVideo | null,
  isLoading: false,
  error: null as string | null,
  loadVideo: mockLoadVideo,
}

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ id: '1' }),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  }
})

vi.mock('@/hooks/useVideos', () => ({
  useVideo: () => mockUseVideoReturn,
}))

vi.mock('@/components/layout/AppNav', () => ({
  AppNav: () => <nav data-testid="app-nav" />,
}))

vi.mock('@/hooks/useTags', () => ({
  useTags: () => ({
    tags: [{ id: 1, name: 'Tag1', color: 'red' }],
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
    mockUseVideoReturn = { video: mockVideo, isLoading: false, error: null, loadVideo: mockLoadVideo }
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

  it('should not render breadcrumb text', () => {
    render(<VideoDetailPage />)

    expect(screen.queryByText('videos.detail.videosBreadcrumb')).not.toBeInTheDocument()
  })

  it('should render transcript when available', () => {
    render(<VideoDetailPage />)

    expect(screen.getByText('videos.detail.transcriptSection')).toBeInTheDocument()
    expect(screen.getByText(/Hello world/)).toBeInTheDocument()
  })

  it('should open edit modal when edit button is clicked', () => {
    render(<VideoDetailPage />)

    fireEvent.click(screen.getByText('videos.detail.editButton'))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('common.actions.save')).toBeInTheDocument()
    expect(screen.getByText('common.actions.cancel')).toBeInTheDocument()
  })

  it('should not replace info card with inline form when edit button is clicked', () => {
    render(<VideoDetailPage />)

    fireEvent.click(screen.getByText('videos.detail.editButton'))

    // Info card should still be visible (title appears in card + in modal dialog)
    expect(screen.getAllByText('Test Video').length).toBeGreaterThan(0)
    // The dialog should be open
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('should not manually load video on mount (query handles initial fetch)', () => {
    render(<VideoDetailPage />)

    expect(mockLoadVideo).not.toHaveBeenCalled()
  })

  it('should not render a fixed sub-header below the nav', () => {
    const { container } = render(<VideoDetailPage />)
    const subHeader = container.querySelector('.fixed.top-16.z-40')
    expect(subHeader).toBeNull()
  })

})

describe('VideoDetailPage - Edit modal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseVideoReturn = { video: mockVideo, isLoading: false, error: null, loadVideo: mockLoadVideo }
  })

  it('should show update error in modal when save fails', async () => {
    ;(apiClient.updateVideo as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Update failed'),
    )

    render(<VideoDetailPage />)

    fireEvent.click(screen.getByText('videos.detail.editButton'))
    fireEvent.click(screen.getByText('common.actions.save'))

    await waitFor(() => {
      expect(screen.getByText('Update failed')).toBeInTheDocument()
    })
  })

  it('should close modal on cancel', async () => {
    ;(apiClient.updateVideo as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Update failed'),
    )

    render(<VideoDetailPage />)

    fireEvent.click(screen.getByText('videos.detail.editButton'))
    fireEvent.click(screen.getByText('common.actions.save'))

    await waitFor(() => {
      expect(screen.getByText('Update failed')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('common.actions.cancel'))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('should clear error when modal is reopened after cancel', async () => {
    ;(apiClient.updateVideo as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Update failed'),
    )

    render(<VideoDetailPage />)

    // Open → save → error appears
    fireEvent.click(screen.getByText('videos.detail.editButton'))
    fireEvent.click(screen.getByText('common.actions.save'))
    await waitFor(() => {
      expect(screen.getByText('Update failed')).toBeInTheDocument()
    })

    // Cancel closes modal
    fireEvent.click(screen.getByText('common.actions.cancel'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Reopen → error should NOT be visible
    fireEvent.click(screen.getByText('videos.detail.editButton'))
    expect(screen.queryByText('Update failed')).not.toBeInTheDocument()
  })
})

describe('VideoDetailPage - Delete error', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseVideoReturn = { video: mockVideo, isLoading: false, error: null, loadVideo: mockLoadVideo }
  })

  it('should show delete error when delete fails', async () => {
    ;(apiClient.deleteVideo as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Delete failed'),
    )

    render(<VideoDetailPage />)

    fireEvent.click(screen.getByText('videos.detail.deleteButton'))
    fireEvent.click(await screen.findByRole('button', { name: 'common.actions.delete' }))

    await waitFor(() => {
      expect(screen.getByText('Delete failed')).toBeInTheDocument()
    })
  })
})

describe('VideoDetailPage - Transcript save error', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseVideoReturn = { video: mockVideo, isLoading: false, error: null, loadVideo: mockLoadVideo }
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

describe('VideoDetailPage - Loading state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseVideoReturn = { video: null, isLoading: true, error: null, loadVideo: vi.fn() }
  })

  afterEach(() => {
    mockUseVideoReturn = { video: mockVideo, isLoading: false, error: null, loadVideo: mockLoadVideo }
  })

  it('should render AppNav during initial loading', () => {
    render(<VideoDetailPage />)
    expect(screen.getByTestId('app-nav')).toBeInTheDocument()
  })

  it('should not show full-screen loading overlay (AppNav is separate)', () => {
    const { container } = render(<VideoDetailPage />)
    // The outer wrapper should NOT be the sole full-screen centering container
    const loadingWrapper = container.querySelector('.min-h-screen.flex.items-center.justify-center')
    expect(loadingWrapper).toBeNull()
  })
})

describe('VideoDetailPage - Error state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseVideoReturn = { video: null, isLoading: false, error: 'Network error', loadVideo: vi.fn() }
  })

  afterEach(() => {
    mockUseVideoReturn = { video: mockVideo, isLoading: false, error: null, loadVideo: mockLoadVideo }
  })

  it('should render AppNav when there is an error', () => {
    render(<VideoDetailPage />)
    expect(screen.getByTestId('app-nav')).toBeInTheDocument()
  })
})

describe('VideoDetailPage - Not found state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseVideoReturn = { video: null, isLoading: false, error: null, loadVideo: vi.fn() }
  })

  afterEach(() => {
    mockUseVideoReturn = { video: mockVideo, isLoading: false, error: null, loadVideo: mockLoadVideo }
  })

  it('should render AppNav when video is not found', () => {
    render(<VideoDetailPage />)
    expect(screen.getByTestId('app-nav')).toBeInTheDocument()
  })
})

describe('VideoDetailPage - Delete', () => {
  it('should call deleteVideo when delete is confirmed', async () => {
      ; (apiClient.deleteVideo as ReturnType<typeof vi.fn>).mockResolvedValue({})

    render(<VideoDetailPage />)

    const deleteButton = screen.getByText('videos.detail.deleteButton')
    fireEvent.click(deleteButton)
    fireEvent.click(await screen.findByRole('button', { name: 'common.actions.delete' }))

    await waitFor(() => {
      expect(apiClient.deleteVideo).toHaveBeenCalledWith(1)
    })
  })
})
