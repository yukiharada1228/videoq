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

const mockCourses = [
  { id: 1, name: 'Course 1', video_count: 2 },
  { id: 2, name: 'Course 2', video_count: 3 },
]

describe('HomePage - authenticated', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate = useI18nNavigate() as ReturnType<typeof vi.fn>
    ;(apiClient.getMeOrNull as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1,
      username: 'testuser',
      used_storage_bytes: 2.5 * 1024 ** 3,
      storage_limit_bytes: 10 * 1024 ** 3,
      used_processing_seconds: 65 * 60,
      processing_limit_seconds: 180 * 60,
      used_ai_answers: 12,
      ai_answers_limit: 100,
      is_over_quota: false,
    })
    ;(apiClient.getVideos as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockVideos,
      meta: { total: mockVideos.length, limit: 24, offset: 0 },
    })
    ;(apiClient.getVideoCoursesPage as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockCourses,
      meta: { total: mockCourses.length, limit: 1, offset: 0 },
    })
    ;(apiClient.getVideoStats as ReturnType<typeof vi.fn>).mockResolvedValue({
      total: 24,
      completed: 20,
      pending: 0,
      processing: 0,
      indexing: 0,
      error: 0,
      uploading: 0,
    })
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

  it('should render courses action card', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText('home.actions.courses.title')).toBeInTheDocument()
    })
  })

  it('should not render the redundant courses tip', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText('home.actions.courses.title')).toBeInTheDocument()
    })

    expect(screen.queryByText('home.tips.hint')).not.toBeInTheDocument()
    expect(screen.queryByText('home.tips.message')).not.toBeInTheDocument()
  })

  it('should render stats cards', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText('home.stats.totalVideos')).toBeInTheDocument()
      expect(screen.getByText('home.stats.analysisCompleted')).toBeInTheDocument()
      expect(screen.getByText('home.stats.processing')).toBeInTheDocument()
      expect(screen.getByText('home.stats.courses')).toBeInTheDocument()
    })
  })

  it('should show library-wide counts instead of the first video page', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText('home.stats.totalVideos').parentElement).toHaveTextContent('24')
      expect(screen.getByText('home.stats.analysisCompleted').parentElement).toHaveTextContent('20')
    })
  })

  it('should render usage cards from the current user payload', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText('home.usage.title')).toBeInTheDocument()
    })

    const storageCard = screen.getByText('quota.usage.storage').parentElement
    const transcriptionCard = screen.getByText('quota.usage.transcription').parentElement
    const aiAnswersCard = screen.getByText('quota.usage.aiAnswers').parentElement

    expect(storageCard?.textContent).toContain('2.5')
    expect(storageCard?.textContent).toContain('10')
    expect(transcriptionCard?.textContent).toContain('65')
    expect(transcriptionCard?.textContent).toContain('180')
    expect(aiAnswersCard?.textContent).toContain('12')
    expect(aiAnswersCard?.textContent).toContain('100')
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

  it('should navigate to courses page when courses card is clicked', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByText('home.actions.courses.title')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('home.actions.courses.title'))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/videos/courses')
    })
  })

  it('should load videos and courses on mount', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(apiClient.getVideos).toHaveBeenCalled()
      expect(apiClient.getVideoCoursesPage).toHaveBeenCalled()
      expect(apiClient.getVideoStats).toHaveBeenCalled()
    })
  })

})

describe('HomePage - Data Loading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(apiClient.getMeOrNull as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 1, username: 'testuser' })
    ;(apiClient.getVideos as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockVideos,
      meta: { total: mockVideos.length, limit: 24, offset: 0 },
    })
    ;(apiClient.getVideoCoursesPage as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockCourses,
      meta: { total: mockCourses.length, limit: 1, offset: 0 },
    })
    ;(apiClient.getVideoStats as ReturnType<typeof vi.fn>).mockResolvedValue({
      total: 5,
      completed: 1,
      pending: 1,
      processing: 1,
      indexing: 1,
      error: 1,
      uploading: 0,
    })
  })

  it('should handle API errors gracefully', async () => {
    ;(apiClient.getVideos as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'))
    ;(apiClient.getVideoCoursesPage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'))
    ;(apiClient.getVideoStats as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'))

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
    ;(globalThis as any).__setMockAuthSession?.(null)
    ;(apiClient.getMeOrNull as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  })

  afterEach(() => {
    globalThis.__setMockLanguage('en')
  })

  it('should render the product landing page when user is not authenticated', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'landing.title' })).toBeInTheDocument()
    })
  })

  it('should not render home dashboard when user is not authenticated', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.queryByText(/home\.welcome\.greeting/)).not.toBeInTheDocument()
    })
  })

  it('should render signup and login actions when user is not authenticated', async () => {
    render(<HomePage />)

    await waitFor(() => {
      expect(screen.getAllByText('landing.start').length).toBeGreaterThan(0)
      expect(screen.getAllByText('landing.login').length).toBeGreaterThan(0)
    })
  })
})
