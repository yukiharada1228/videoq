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

describe('HomePage - authenticated', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate = useI18nNavigate() as ReturnType<typeof vi.fn>
    ;(apiClient.getMeOrNull as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1, username: 'testuser' })
    ;(apiClient.getVideos as ReturnType<typeof vi.fn>).mockResolvedValue(mockVideos)
    ;(apiClient.getVideoGroups as ReturnType<typeof vi.fn>).mockResolvedValue(mockGroups)
  })

  it('should render welcome title', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText('home.welcome.greeting {"username":"testuser"}')).toBeInTheDocument()
    })
  })

  it('should render welcome subtitle', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText('home.welcome.dailyMotivation')).toBeInTheDocument()
    })
  })

  it('should render upload action card', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getAllByText('home.actions.upload.title').length).toBeGreaterThan(0)
      expect(screen.getByText('home.actions.upload.descriptionLong')).toBeInTheDocument()
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
      expect(screen.getByText('home.stats.totalVideos')).toBeInTheDocument()
      expect(screen.getByText('home.stats.analysisCompleted')).toBeInTheDocument()
      expect(screen.getByText('home.stats.processing')).toBeInTheDocument()
      expect(screen.getByText('home.stats.groups')).toBeInTheDocument()
    })
  })

  it('should navigate to videos page with upload param when upload button is clicked', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getAllByText('home.actions.upload.title').length).toBeGreaterThan(0)
    })

    // Click the header upload button
    const uploadButtons = screen.getAllByText('home.actions.upload.title')
    fireEvent.click(uploadButtons[0])

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/videos?upload=true')
    })
  })

  it('should navigate to videos page when library card is clicked', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText('home.actions.library.title')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('home.actions.library.title'))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/videos')
    })
  })

  it('should navigate to groups page when groups card is clicked', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText('home.actions.groups.title')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('home.actions.groups.title'))

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
    ;(apiClient.getMeOrNull as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1, username: 'testuser' })
    ;(apiClient.getVideos as ReturnType<typeof vi.fn>).mockResolvedValue(mockVideos)
    ;(apiClient.getVideoGroups as ReturnType<typeof vi.fn>).mockResolvedValue(mockGroups)
  })

  it('should handle API errors gracefully', async () => {
    ;(apiClient.getVideos as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'))
    ;(apiClient.getVideoGroups as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'))

    render(<HomePage />)

    // Should still render the page (useHomePageData catches errors internally)
    await waitFor(() => {
      expect(screen.getByText('home.welcome.greeting {"username":"testuser"}')).toBeInTheDocument()
    })
  })
})

describe('HomePage - unauthenticated', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(apiClient.getMeOrNull as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  })

  it('should render landing page hero when user is not authenticated', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('landing.hero.title')
    })
  })

  it('should render persona cards when user is not authenticated', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText('landing.personas.title')).toBeInTheDocument()
      expect(screen.getByText('landing.personas.educator.title')).toBeInTheDocument()
      expect(screen.getByText('landing.personas.corporateTrainer.title')).toBeInTheDocument()
      expect(screen.getByText('landing.personas.developer.title')).toBeInTheDocument()
    })
  })

  it('should render use-case LP links when user is not authenticated', async () => {
    render(<HomePage />)

    await waitFor(() => {
      const educationLink = screen.getByText('landing.personas.educator.ctaLink')
      expect(educationLink.closest('a')).toHaveAttribute('href', '/use-cases/education')

      const trainingLink = screen.getByText('landing.personas.corporateTrainer.ctaLink')
      expect(trainingLink.closest('a')).toHaveAttribute('href', '/use-cases/corporate-training')
    })
  })

  it('should NOT render home dashboard when user is not authenticated', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.queryByText(/home\.welcome\.greeting/)).not.toBeInTheDocument()
    })
  })
})
