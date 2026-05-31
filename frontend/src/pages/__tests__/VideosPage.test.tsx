import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import VideosPage from '../VideosPage'

const mockVideos = [
  { id: 1, title: 'Video 1', status: 'completed', file: 'test1.mp4', uploaded_at: '2024-01-01' },
  { id: 2, title: 'Video 2', status: 'pending', file: 'test2.mp4', uploaded_at: '2024-01-02' },
  { id: 3, title: 'Video 3', status: 'processing', file: 'test3.mp4', uploaded_at: '2024-01-03' },
  { id: 4, title: 'Video 4', status: 'indexing', file: 'test4.mp4', uploaded_at: '2024-01-04' },
]

const mockLoadVideos = vi.fn()
const mockFetchNextPage = vi.fn()
const mockUseVideos = vi.fn()

let mockHasNextPage = false
let mockIsFetchingNextPage = false
let mockTotalCount = 4

vi.mock('@/hooks/useVideos', () => ({
  useVideos: (params: unknown) => mockUseVideos(params),
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
    user: { id: 1, username: 'testuser', video_count: 3 },
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
    mockFetchNextPage.mockClear()
    mockHasNextPage = false
    mockIsFetchingNextPage = false
    mockTotalCount = 4
    globalThis.__setMockSearchParams('')
    globalThis.__getMockSetSearchParams().mockClear()
    mockUseVideos.mockImplementation(() => ({
      videos: mockVideos,
      isLoading: false,
      error: null,
      hasNextPage: mockHasNextPage,
      fetchNextPage: mockFetchNextPage,
      isFetchingNextPage: mockIsFetchingNextPage,
      totalCount: mockTotalCount,
      loadVideos: mockLoadVideos,
      refetch: mockLoadVideos,
      sentinelRef: vi.fn(),
    }))
  })

  afterEach(() => {
    globalThis.__setMockLanguage('en')
  })

  it('should render page title', () => {
    render(<VideosPage />)

    expect(screen.getByText('videos.list.title')).toBeInTheDocument()
  })

  it('should render video count subtitle using totalCount', () => {
    render(<VideosPage />)

    expect(screen.getByText('videos.list.managingCount {"count":4}')).toBeInTheDocument()
  })

  it('should render upload button', () => {
    render(<VideosPage />)

    expect(screen.getByText('videos.list.uploadButton')).toBeInTheDocument()
  })

  it('should render stats cards', () => {
    render(<VideosPage />)

    expect(screen.getByText('videos.list.statsRow.all')).toBeInTheDocument()
    expect(screen.getByText('videos.list.statsRow.completed')).toBeInTheDocument()
    expect(screen.getByText('videos.list.statsRow.pending')).toBeInTheDocument()
    expect(screen.getByText('videos.list.statsRow.processing')).toBeInTheDocument()
    expect(screen.getByText('videos.list.statsRow.indexing')).toBeInTheDocument()
  })

  it('should render video list', () => {
    render(<VideosPage />)

    expect(screen.getByText('Video 1')).toBeInTheDocument()
    expect(screen.getByText('Video 2')).toBeInTheDocument()
    expect(screen.getByText('Video 3')).toBeInTheDocument()
    expect(screen.getByText('Video 4')).toBeInTheDocument()
  })

  it('should pass URL filters to useVideos on initial render', () => {
    globalThis.__setMockSearchParams('q=python&status=completed&ordering=title_asc&tags=2,1')

    render(<VideosPage />)

    expect(mockUseVideos).toHaveBeenCalledWith({
      tagIds: [1, 2],
      q: 'python',
      status: 'completed',
      ordering: 'title_asc',
    })
  })

  it('should map the processing URL filter to all in-progress API statuses', () => {
    globalThis.__setMockSearchParams('status=processing')

    render(<VideosPage />)

    expect(mockUseVideos).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'pending,processing,indexing,uploading',
      }),
    )
  })

  it('should update the URL when filters change', () => {
    render(<VideosPage />)

    fireEvent.change(screen.getByPlaceholderText('videos.list.searchPlaceholder'), {
      target: { value: 'django' },
    })
    let lastCall = globalThis.__getMockSetSearchParams().mock.calls.at(-1)
    expect(lastCall?.[0].toString()).toBe('q=django')
    expect(lastCall?.[1]).toEqual({ replace: true })

    fireEvent.click(screen.getByText('videos.list.filter.completed'))
    lastCall = globalThis.__getMockSetSearchParams().mock.calls.at(-1)
    expect(lastCall?.[0].toString()).toBe('status=completed')
    expect(lastCall?.[1]).toEqual({ replace: true })
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

    const statCards = screen.getAllByText(/^\d+$/)
    expect(statCards.length).toBeGreaterThan(0)
  })

  it('should not render load more button', () => {
    render(<VideosPage />)

    expect(screen.queryByText('videos.list.loadMore')).not.toBeInTheDocument()
  })

  it('should render infinite scroll sentinel element', () => {
    render(<VideosPage />)

    expect(screen.getByTestId('infinite-scroll-sentinel')).toBeInTheDocument()
  })

  it('should show loading text when isFetchingNextPage is true', () => {
    mockIsFetchingNextPage = true
    render(<VideosPage />)

    expect(screen.getByText('videos.list.loadingMore')).toBeInTheDocument()
  })
})

describe('VideosPage - Upload Limit', () => {
  beforeEach(() => {
    mockHasNextPage = false
    mockIsFetchingNextPage = false
    mockTotalCount = 4
  })

  it('should show upload button', () => {
    render(<VideosPage />)

    const uploadButton = screen.getByText('videos.list.uploadButton')
    expect(uploadButton).toBeInTheDocument()
  })
})
