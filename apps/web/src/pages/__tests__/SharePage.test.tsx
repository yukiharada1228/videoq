import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import SharePage from '../SharePage'

const getSharedCourse = vi.fn()

const mockCourse = {
  id: 1,
  name: 'Shared Course',
  description: 'Shared Description',
  videos: [
    { id: 1, title: 'Shared Video 1', description: 'Desc 1', status: 'completed', file: 'video1.mp4', source_type: 'uploaded', order: 0 },
    { id: 2, title: 'Shared Video 2', description: '', status: 'completed', file: 'video2.mp4', source_type: 'uploaded', order: 1 },
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
    getSharedVideoUrl: vi.fn((url, token) => `${url}?token=${token}`),
  },
}))

vi.mock('@/components/chat/ChatPanel', () => ({
  ChatPanel: () => <div data-testid="chat-panel">Chat Panel</div>,
}))

describe('SharePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.__setTrpcHandler('courses.shared', getSharedCourse)
    getSharedCourse.mockResolvedValue(mockCourse)
  })

  afterEach(() => {
    globalThis.__setMockLanguage('en')
  })

  it('should render course name', async () => {
    render(<SharePage />)

    await waitFor(() => {
      expect(screen.getAllByText('Shared Course').length).toBeGreaterThan(0)
    })
  })

  it('should render video list', async () => {
    render(<SharePage />)

    await waitFor(() => {
      expect(screen.getAllByText('Shared Video 1').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Shared Video 2').length).toBeGreaterThan(0)
    })
  })

  it('keeps one chat panel mounted across responsive layouts and mobile tabs', async () => {
    render(<SharePage />)

    const panel = await screen.findByTestId('chat-panel')
    try {
      for (const width of [390, 1280, 390]) {
        vi.stubGlobal('innerWidth', width)
        fireEvent(window, new Event('resize'))
        expect(screen.getByTestId('chat-panel')).toBe(panel)
      }
      for (const tab of ['videos', 'player']) {
        fireEvent.click(screen.getByRole('button', { name: `videos.shared.tabs.${tab}` }))
        expect(screen.getByTestId('chat-panel')).toBe(panel)
      }
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('should select first video by default', async () => {
    render(<SharePage />)

    await waitFor(() => {
      // First video title should appear in player header
      const titles = screen.getAllByText('Shared Video 1')
      expect(titles.length).toBeGreaterThan(0)
    })
  })

  it('should load shared course on mount', async () => {
    render(<SharePage />)

    await waitFor(() => {
      expect(getSharedCourse).toHaveBeenCalledWith({ slug: 'test-share-token' })
    })
  })

  it('should not autoplay youtube video on initial render', async () => {
    const youtubeCourse = {
      ...mockCourse,
      videos: [
        {
          id: 1,
          title: 'Shared Video 1',
          description: 'Desc 1',
          status: 'completed',
          file: null,
          source_type: 'youtube' as const,
          youtube_embed_url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
          order: 0,
        },
      ],
    }
    getSharedCourse.mockResolvedValue(youtubeCourse)

    const { container } = render(<SharePage />)

    await waitFor(() => {
      const iframe = container.querySelector('iframe')
      expect(iframe).not.toBeNull()
      expect(iframe?.getAttribute('src')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
    })
  })


})

describe('SharePage - Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.__setTrpcHandler('courses.shared', getSharedCourse)
  })

  it('should display error message when share link is invalid', async () => {
    getSharedCourse.mockRejectedValue(new Error('Not found'))

    render(<SharePage />)

    await waitFor(() => {
      expect(screen.getByText('common.messages.shareLoadFailed')).toBeInTheDocument()
    })
  })
})

describe('SharePage - Empty Course', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.__setTrpcHandler('courses.shared', getSharedCourse)
    const emptyCourse = { ...mockCourse, videos: [] }
    getSharedCourse.mockResolvedValue(emptyCourse)
  })

  it('should display no videos message when course is empty', async () => {
    render(<SharePage />)

    await waitFor(() => {
      expect(screen.getByText('videos.shared.noVideos')).toBeInTheDocument()
    })
  })
})
