import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import VideoDetailPage from '../VideoDetailPage'
import { apiClient } from '@/lib/api'
import { useI18nNavigate } from '@/lib/i18n'

const mockVideo = {
  id: 1,
  title: 'Test Video',
  description: 'Test Description',
  status: 'completed',
  file: 'test.mp4',
  uploaded_at: '2024-01-01T00:00:00Z',
  transcript: '1\n00:00:00,000 --> 00:00:05,000\nHello world',
  tags: [{ id: 1, name: 'Tag1', color: '#FF0000' }],
  external_id: null,
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

vi.mock('@/lib/api', () => ({
  apiClient: {
    updateVideo: vi.fn(),
    deleteVideo: vi.fn(),
    getVideoUrl: vi.fn((url) => url),
    addTagsToVideo: vi.fn(),
    removeTagFromVideo: vi.fn(),
  },
}))

describe('VideoDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render video title', () => {
    render(<VideoDetailPage />)

    expect(screen.getByText('Test Video')).toBeInTheDocument()
  })

  it('should render video description', () => {
    render(<VideoDetailPage />)

    expect(screen.getByText('Test Description')).toBeInTheDocument()
  })

  it('should render video status', () => {
    render(<VideoDetailPage />)

    expect(screen.getByText('videos.detail.labels.status')).toBeInTheDocument()
  })

  it('should render edit button', () => {
    render(<VideoDetailPage />)

    expect(screen.getByText('videos.detail.edit')).toBeInTheDocument()
  })

  it('should render delete button', () => {
    render(<VideoDetailPage />)

    expect(screen.getByText('common.actions.delete')).toBeInTheDocument()
  })

  it('should render back to list button', () => {
    render(<VideoDetailPage />)

    expect(screen.getByText('common.actions.backToList')).toBeInTheDocument()
  })

  it('should render transcript when available', () => {
    render(<VideoDetailPage />)

    expect(screen.getByText('videos.detail.transcript')).toBeInTheDocument()
    expect(screen.getByText(/Hello world/)).toBeInTheDocument()
  })

  it('should enter edit mode when edit button is clicked', () => {
    render(<VideoDetailPage />)

    const editButton = screen.getByText('videos.detail.edit')
    fireEvent.click(editButton)

    expect(screen.getByText('videos.detail.save')).toBeInTheDocument()
    expect(screen.getByText('videos.detail.cancel')).toBeInTheDocument()
  })

  it('should load video on mount', () => {
    render(<VideoDetailPage />)

    expect(mockLoadVideo).toHaveBeenCalled()
  })
})

describe('VideoDetailPage - Delete', () => {
  it('should call deleteVideo when delete is confirmed', async () => {
    window.confirm = vi.fn(() => true)
    ;(apiClient.deleteVideo as ReturnType<typeof vi.fn>).mockResolvedValue({})

    render(<VideoDetailPage />)

    const deleteButton = screen.getByText('common.actions.delete')
    fireEvent.click(deleteButton)

    await waitFor(() => {
      expect(apiClient.deleteVideo).toHaveBeenCalledWith(1)
    })
  })
})
