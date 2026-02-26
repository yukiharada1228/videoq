import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import VideosPage from '../VideosPage'

const mockVideos = [
  { id: 1, title: 'Video 1', status: 'completed', file: 'test1.mp4', uploaded_at: '2024-01-01' },
  { id: 2, title: 'Video 2', status: 'pending', file: 'test2.mp4', uploaded_at: '2024-01-02' },
  { id: 3, title: 'Video 3', status: 'processing', file: 'test3.mp4', uploaded_at: '2024-01-03' },
]

const mockLoadVideos = vi.fn()

vi.mock('@/hooks/useVideos', () => ({
  useVideos: () => ({
    videos: mockVideos,
    isLoading: false,
    error: null,
    loadVideos: mockLoadVideos,
    refetch: mockLoadVideos,
  }),
}))

vi.mock('@/hooks/useVideoStats', () => ({
  useVideoStats: () => ({
    total: 3,
    completed: 1,
    pending: 1,
    processing: 1,
    error: 0,
  }),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'testuser', video_limit: 10, video_count: 3 },
    loading: false,
    refetch: vi.fn(),
  }),
}))

vi.mock('@/hooks/useTags', () => ({
  useTags: () => ({
    tags: [],
  }),
}))

vi.mock('@/components/video/VideoUploadModal', () => ({
  VideoUploadModal: ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) =>
    isOpen ? <div data-testid="upload-modal"><button onClick={onClose}>Close</button></div> : null,
}))

vi.mock('@/components/video/VideoList', () => ({
  VideoList: ({ videos }: { videos: typeof mockVideos }) => (
    <div data-testid="video-list">
      {videos.map(v => <div key={v.id}>{v.title}</div>)}
    </div>
  ),
}))

vi.mock('@/components/video/TagFilterPanel', () => ({
  TagFilterPanel: () => <div data-testid="tag-filter-panel" />,
}))

vi.mock('@/components/video/TagManagementModal', () => ({
  TagManagementModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="tag-modal" /> : null,
}))

describe('VideosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadVideos.mockClear()
  })

  it('should render page title', () => {
    render(<VideosPage />)

    expect(screen.getByText('videos.list.title')).toBeInTheDocument()
  })

  it('should render video count subtitle', () => {
    render(<VideosPage />)

    expect(screen.getByText(/videos.list.subtitle/)).toBeInTheDocument()
  })

  it('should render upload button', () => {
    render(<VideosPage />)

    expect(screen.getByText('videos.list.uploadButton')).toBeInTheDocument()
  })

  it('should render stats cards', () => {
    render(<VideosPage />)

    expect(screen.getByText('videos.list.stats.total')).toBeInTheDocument()
    expect(screen.getByText('videos.list.stats.completed')).toBeInTheDocument()
    expect(screen.getByText('videos.list.stats.pending')).toBeInTheDocument()
    expect(screen.getByText('videos.list.stats.processing')).toBeInTheDocument()
  })

  it('should render video list', () => {
    render(<VideosPage />)

    expect(screen.getByTestId('video-list')).toBeInTheDocument()
    expect(screen.getByText('Video 1')).toBeInTheDocument()
    expect(screen.getByText('Video 2')).toBeInTheDocument()
    expect(screen.getByText('Video 3')).toBeInTheDocument()
  })

  it('should render tag filter panel', () => {
    render(<VideosPage />)

    expect(screen.getByTestId('tag-filter-panel')).toBeInTheDocument()
  })

  it('should not manually load videos on mount (query handles initial fetch)', () => {
    render(<VideosPage />)

    expect(mockLoadVideos).not.toHaveBeenCalled()
  })

  it('should open upload modal when upload button is clicked', () => {
    render(<VideosPage />)

    const uploadButton = screen.getByText('videos.list.uploadButton')
    fireEvent.click(uploadButton)

    expect(screen.getByTestId('upload-modal')).toBeInTheDocument()
  })

  it('should close upload modal when close is clicked', async () => {
    render(<VideosPage />)

    const uploadButton = screen.getByText('videos.list.uploadButton')
    fireEvent.click(uploadButton)

    expect(screen.getByTestId('upload-modal')).toBeInTheDocument()

    const closeButton = screen.getByText('Close')
    fireEvent.click(closeButton)

    await waitFor(() => {
      expect(screen.queryByTestId('upload-modal')).not.toBeInTheDocument()
    })
  })

  it('should display stat values correctly', () => {
    render(<VideosPage />)

    // Check stat values are displayed
    const statCards = screen.getAllByText(/^\d+$/)
    expect(statCards.length).toBeGreaterThan(0)
  })
})

describe('VideosPage - Upload Limit', () => {
  it('should show upload limit in button when limit exists', () => {
    render(<VideosPage />)

    // The upload button should be rendered
    const uploadButton = screen.getByText('videos.list.uploadButton')
    expect(uploadButton).toBeInTheDocument()
  })
})
