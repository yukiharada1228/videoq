import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { useQueryClient } from '@tanstack/react-query'
import { trpc } from '@/lib/trpc'
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
  ChatPanel: ({ onVideoPlay }: { onVideoPlay: (id: number, time: string) => void }) => (
    <div data-testid="chat-panel"><button onClick={() => onVideoPlay(1, '00:02:00')}>Play citation</button></div>
  ),
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

  it('keeps the player and chat mounted while the shared course refreshes', async () => {
    const { result } = renderHook(() => useQueryClient())
    const { container } = render(<SharePage />)
    const chat = await screen.findByTestId('chat-panel')
    const player = container.querySelector('video')!
    player.currentTime = 45
    let finish!: (course: typeof mockCourse) => void
    getSharedCourse.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    let refresh!: Promise<void>
    act(() => { refresh = result.current.invalidateQueries(trpc.courses.shared.pathFilter()) })
    await waitFor(() => expect(getSharedCourse).toHaveBeenCalledTimes(2))
    expect(container.querySelector('video')).toBe(player)
    expect(screen.getByTestId('chat-panel')).toBe(chat)
    await act(async () => { finish(mockCourse); await refresh })
    expect(container.querySelector('video')).toBe(player)
    expect(player.currentTime).toBe(45)
  })

  it('clears citation playback when manually selecting another YouTube video', async () => {
    getSharedCourse.mockResolvedValue({ ...mockCourse, videos: mockCourse.videos.map(video => ({
      ...video, file: null, source_type: 'youtube', youtube_embed_url: `https://www.youtube.com/embed/video${video.id}`,
    })) })
    const { container } = render(<SharePage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Play citation' }))
    expect(container.querySelector('iframe')).toHaveAttribute('src', 'https://www.youtube.com/embed/video1?autoplay=1&start=120')
    fireEvent.click(screen.getByText('Shared Video 2'))
    expect(container.querySelector('iframe')).toHaveAttribute('src', 'https://www.youtube.com/embed/video2')
    fireEvent.click(screen.getByText('Shared Video 1'))
    expect(container.querySelector('iframe')).toHaveAttribute('src', 'https://www.youtube.com/embed/video1')
  })

  it('restarts YouTube playback each time the same citation is clicked', async () => {
    getSharedCourse.mockResolvedValue({ ...mockCourse, videos: mockCourse.videos.map(video => ({
      ...video, file: null, source_type: 'youtube', youtube_embed_url: `https://www.youtube.com/embed/video${video.id}`,
    })) })
    const { container, rerender } = render(<SharePage />)
    const citation = await screen.findByRole('button', { name: 'Play citation' })
    for (let attempt = 0; attempt < 3; attempt++) {
      const previous = container.querySelector('iframe')
      fireEvent.click(citation)
      const current = container.querySelector('iframe')
      expect(current).not.toBe(previous)
      expect(current).toHaveAttribute('src', 'https://www.youtube.com/embed/video1?autoplay=1&start=120')
      rerender(<SharePage />)
      expect(container.querySelector('iframe')).toBe(current)
    }
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
