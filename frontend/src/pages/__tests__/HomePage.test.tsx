import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import HomePage from '../HomePage'
import { apiClient } from '@/lib/api'
import { useI18nNavigate } from '@/lib/i18n'

let mockNavigate: ReturnType<typeof vi.fn>

const mockVideos = [
  { id: 1, title: 'Video 1', status: 'completed' },
  { id: 2, title: 'Video 2', status: 'pending' },
  { id: 3, title: 'Video 3', status: 'processing' },
  { id: 4, title: 'Video 4', status: 'error' },
]

const mockGroups = [
  { id: 1, name: 'Group 1', video_count: 2 },
  { id: 2, name: 'Group 2', video_count: 3 },
]

vi.mock('@/lib/api', () => ({
  apiClient: {
    getVideos: vi.fn(),
    getVideoGroups: vi.fn(),
  },
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'testuser' },
    loading: false,
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
      expect(screen.getByText('home.welcome.title')).toBeInTheDocument()
    })
  })

  it('should render welcome subtitle with username', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText(/home\.welcome\.subtitle.*testuser/)).toBeInTheDocument()
    })
  })

  it('should render upload action card', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText('home.actions.upload.title')).toBeInTheDocument()
      expect(screen.getByText('home.actions.upload.description')).toBeInTheDocument()
    })
  })

  it('should render library action card', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText('home.actions.library.title')).toBeInTheDocument()
    })
  })

  it('should render groups action card', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText('home.actions.groups.title')).toBeInTheDocument()
    })
  })

  it('should render stats cards', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText('home.stats.completed')).toBeInTheDocument()
      expect(screen.getByText('home.stats.pending')).toBeInTheDocument()
      expect(screen.getByText('home.stats.processing')).toBeInTheDocument()
      expect(screen.getByText('home.stats.error')).toBeInTheDocument()
    })
  })

  it('should navigate to videos page with upload param when upload card is clicked', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText('home.actions.upload.title')).toBeInTheDocument()
    })

    const uploadCard = screen.getByText('home.actions.upload.title').closest('[data-slot="card"]')
    if (uploadCard) {
      fireEvent.click(uploadCard)
    }

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/videos?upload=true')
    })
  })

  it('should navigate to videos page when library card is clicked', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText('home.actions.library.title')).toBeInTheDocument()
    })

    const libraryCard = screen.getByText('home.actions.library.title').closest('[data-slot="card"]')
    if (libraryCard) {
      fireEvent.click(libraryCard)
    }

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/videos')
    })
  })

  it('should navigate to groups page when groups card is clicked', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText('home.actions.groups.title')).toBeInTheDocument()
    })

    const groupsCard = screen.getByText('home.actions.groups.title').closest('[data-slot="card"]')
    if (groupsCard) {
      fireEvent.click(groupsCard)
    }

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

    // Should still render the page
    await waitFor(() => {
      expect(screen.getByText('home.welcome.title')).toBeInTheDocument()
    })
  })
})
