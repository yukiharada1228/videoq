import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import VideosPage from '../VideosPage'

const mockVideos = [
  { id: 1, title: 'Video 1', status: 'completed', file: 'test1.mp4', uploaded_at: '2024-01-01' },
  { id: 2, title: 'Video 2', status: 'pending', file: 'test2.mp4', uploaded_at: '2024-01-02' },
  { id: 3, title: 'Video 3', status: 'processing', file: 'test3.mp4', uploaded_at: '2024-01-03' },
  { id: 4, title: 'Video 4', status: 'indexing', file: 'test4.mp4', uploaded_at: '2024-01-04' },
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
    total: 4,
    completed: 1,
    pending: 1,
    processing: 1,
    indexing: 1,
    error: 0,
  }),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'testuser', video_limit: 10, video_count: 3 },
    isLoading: false,
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

vi.mock('@/components/video/VideoCard', () => ({
  VideoCard: ({ video }: { video: { title: string } }) => (
    <div data-testid="video-card">{video.title}</div>
  ),
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

    expect(screen.getByText('動画ライブラリ')).toBeInTheDocument()
  })

  it('should render video count subtitle', () => {
    render(<VideosPage />)

    expect(screen.getByText(/本の動画を管理中/)).toBeInTheDocument()
  })

  it('should render upload button', () => {
    render(<VideosPage />)

    expect(screen.getByText('動画をアップロード')).toBeInTheDocument()
  })

  it('should render stats cards', () => {
    render(<VideosPage />)

    expect(screen.getByText('全体')).toBeInTheDocument()
    expect(screen.getByText('完了')).toBeInTheDocument()
    expect(screen.getByText('保留中')).toBeInTheDocument()
    expect(screen.getAllByText('処理中').length).toBeGreaterThan(0)
    expect(screen.getByText('インデックス中')).toBeInTheDocument()
  })

  it('should render video list', () => {
    render(<VideosPage />)

    expect(screen.getByText('Video 1')).toBeInTheDocument()
    expect(screen.getByText('Video 2')).toBeInTheDocument()
    expect(screen.getByText('Video 3')).toBeInTheDocument()
    expect(screen.getByText('Video 4')).toBeInTheDocument()
  })

  it('should not manually load videos on mount (query handles initial fetch)', () => {
    render(<VideosPage />)

    expect(mockLoadVideos).not.toHaveBeenCalled()
  })

  it('should open upload modal when upload button is clicked', () => {
    render(<VideosPage />)

    const uploadButton = screen.getByText('動画をアップロード')
    fireEvent.click(uploadButton)

    expect(screen.getByTestId('upload-modal')).toBeInTheDocument()
  })

  it('should close upload modal when close is clicked', async () => {
    render(<VideosPage />)

    const uploadButton = screen.getByText('動画をアップロード')
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

    const statCards = screen.getAllByText(/^\d+$/)
    expect(statCards.length).toBeGreaterThan(0)
  })
})

describe('VideosPage - Upload Limit', () => {
  it('should show upload button', () => {
    render(<VideosPage />)

    const uploadButton = screen.getByText('動画をアップロード')
    expect(uploadButton).toBeInTheDocument()
  })
})
