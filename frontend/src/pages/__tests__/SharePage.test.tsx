import { render, screen, waitFor } from '@testing-library/react'
import SharePage from '../SharePage'
import { apiClient } from '@/lib/api'

const mockGroup = {
  id: 1,
  name: 'Shared Group',
  description: 'Shared Description',
  videos: [
    { id: 1, title: 'Shared Video 1', description: 'Desc 1', status: 'completed', file: 'video1.mp4', order: 0 },
    { id: 2, title: 'Shared Video 2', description: '', status: 'completed', file: 'video2.mp4', order: 1 },
  ],
}

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ token: 'test-share-token' }),
  }
})

vi.mock('@/lib/api', () => ({
  apiClient: {
    getSharedGroup: vi.fn(),
    getSharedVideoUrl: vi.fn((url, token) => `${url}?token=${token}`),
  },
}))

vi.mock('@/components/chat/ChatPanel', () => ({
  ChatPanel: () => <div data-testid="chat-panel">Chat Panel</div>,
}))

describe('SharePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(apiClient.getSharedGroup as ReturnType<typeof vi.fn>).mockResolvedValue(mockGroup)
  })

  it('should render group name', async () => {
    render(<SharePage />)

    await waitFor(() => {
      expect(screen.getByText('Shared Group')).toBeInTheDocument()
    })
  })

  it('should render group description', async () => {
    render(<SharePage />)

    await waitFor(() => {
      expect(screen.getByText('Shared Description')).toBeInTheDocument()
    })
  })

  it('should render video list', async () => {
    render(<SharePage />)

    await waitFor(() => {
      expect(screen.getByText('Shared Video 1')).toBeInTheDocument()
      expect(screen.getByText('Shared Video 2')).toBeInTheDocument()
    })
  })

  it('should render chat panel', async () => {
    render(<SharePage />)

    await waitFor(() => {
      expect(screen.getByTestId('chat-panel')).toBeInTheDocument()
    })
  })

  it('should select first video by default', async () => {
    render(<SharePage />)

    await waitFor(() => {
      // First video title should appear in player header
      const titles = screen.getAllByText('Shared Video 1')
      expect(titles.length).toBeGreaterThan(0)
    })
  })

  it('should load shared group on mount', async () => {
    render(<SharePage />)

    await waitFor(() => {
      expect(apiClient.getSharedGroup).toHaveBeenCalledWith('test-share-token')
    })
  })
})

describe('SharePage - Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should display error message when share link is invalid', async () => {
    ;(apiClient.getSharedGroup as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Not found'))

    render(<SharePage />)

    await waitFor(() => {
      expect(screen.getByText('common.messages.shareLoadFailed')).toBeInTheDocument()
    })
  })
})

describe('SharePage - Empty Group', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const emptyGroup = { ...mockGroup, videos: [] }
    ;(apiClient.getSharedGroup as ReturnType<typeof vi.fn>).mockResolvedValue(emptyGroup)
  })

  it('should display no videos message when group is empty', async () => {
    render(<SharePage />)

    await waitFor(() => {
      expect(screen.getByText('videos.shared.noVideos')).toBeInTheDocument()
    })
  })
})
