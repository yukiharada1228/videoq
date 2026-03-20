import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import HomePage from '../HomePage'
import { apiClient } from '@/lib/api'
import { useI18nNavigate } from '@/lib/i18n'

let mockNavigate: ReturnType<typeof vi.fn>

const mockVideos = [
  { id: 1, title: 'Video 1', status: 'completed', file: 'v1.mp4', uploaded_at: '2024-01-03T00:00:00Z' },
  { id: 2, title: 'Video 2', status: 'pending', file: 'v2.mp4', uploaded_at: '2024-01-02T00:00:00Z' },
  { id: 3, title: 'Video 3', status: 'processing', file: 'v3.mp4', uploaded_at: '2024-01-01T00:00:00Z' },
  { id: 4, title: 'Video 4', status: 'indexing', file: 'v4.mp4', uploaded_at: '2024-01-04T00:00:00Z' },
  { id: 5, title: 'Video 5', status: 'error', file: 'v5.mp4', uploaded_at: '2024-01-05T00:00:00Z' },
]

const mockGroups = [
  { id: 1, name: 'Group 1', video_count: 2 },
  { id: 2, name: 'Group 2', video_count: 3 },
]

vi.mock('@/lib/api', () => ({
  apiClient: {
    getMe: vi.fn(() => Promise.resolve({ id: '1', username: 'testuser', email: 'test@example.com' })),
    getVideos: vi.fn(),
    getVideoGroups: vi.fn(),
    getVideoUrl: vi.fn((url) => url),
  },
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'testuser' },
    isLoading: false,
  }),
}))

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate = useI18nNavigate() as ReturnType<typeof vi.fn>
    ;(apiClient.getVideos as ReturnType<typeof vi.fn>).mockResolvedValue(mockVideos)
    ;(apiClient.getVideoGroups as ReturnType<typeof vi.fn>).mockResolvedValue(mockGroups)
  })

  it('should render welcome title', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText(/おかえりなさい/)).toBeInTheDocument()
    })
  })

  it('should render welcome subtitle', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText(/今日も素晴らしい授業/)).toBeInTheDocument()
    })
  })

  it('should render upload action card', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getAllByText('動画をアップロード').length).toBeGreaterThan(0)
      expect(screen.getByText('新しい授業を追加して、AIによる分析を開始しましょう。')).toBeInTheDocument()
    })
  })

  it('should render library action card', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText('動画ライブラリ')).toBeInTheDocument()
    })
  })

  it('should render groups action card', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText('グループ管理')).toBeInTheDocument()
    })
  })

  it('should render stats cards', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText('総動画数')).toBeInTheDocument()
      expect(screen.getByText('分析完了')).toBeInTheDocument()
      expect(screen.getByText('処理中')).toBeInTheDocument()
      expect(screen.getByText('グループ数')).toBeInTheDocument()
    })
  })

  it('should navigate to videos page with upload param when upload button is clicked', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getAllByText('動画をアップロード').length).toBeGreaterThan(0)
    })

    // Click the header upload button
    const uploadButtons = screen.getAllByText('動画をアップロード')
    fireEvent.click(uploadButtons[0])

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/videos?upload=true')
    })
  })

  it('should navigate to videos page when library card is clicked', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText('動画ライブラリ')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('動画ライブラリ'))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/videos')
    })
  })

  it('should navigate to groups page when groups card is clicked', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText('グループ管理')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('グループ管理'))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/videos/groups')
    })
  })

  it('should load videos and groups on mount', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(apiClient.getVideos).toHaveBeenCalled()
      expect(apiClient.getVideoGroups).toHaveBeenCalled()
    })
  })
})

describe('HomePage - Data Loading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(apiClient.getVideos as ReturnType<typeof vi.fn>).mockResolvedValue(mockVideos)
    ;(apiClient.getVideoGroups as ReturnType<typeof vi.fn>).mockResolvedValue(mockGroups)
  })

  it('should handle API errors gracefully', async () => {
    ;(apiClient.getVideos as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'))
    ;(apiClient.getVideoGroups as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'))

    render(<HomePage />)

    // Should still render the page (useHomePageData catches errors internally)
    await waitFor(() => {
      expect(screen.getByText(/おかえりなさい/)).toBeInTheDocument()
    })
  })
})
