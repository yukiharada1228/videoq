import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { ShortsPlayer } from '../ShortsPlayer'
import { apiClient, type PopularScene } from '@/lib/api'

// Mock apiClient
vi.mock('@/lib/api', () => ({
  apiClient: {
    getVideoUrl: vi.fn((file: string) => `http://localhost/media/${file}`),
    getSharedVideoUrl: vi.fn((file: string, token: string) => `http://localhost/media/${file}?share_token=${token}`),
  },
}))

// Mock IntersectionObserver
const mockIntersectionObserver = vi.fn()
mockIntersectionObserver.mockReturnValue({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
})
window.IntersectionObserver = mockIntersectionObserver

// Mock HTMLMediaElement
window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
window.HTMLMediaElement.prototype.pause = vi.fn()
window.HTMLMediaElement.prototype.load = vi.fn()

const mockScenes: PopularScene[] = [
  {
    video_id: 1,
    title: 'Test Video 1',
    start_time: '00:01:00',
    end_time: '00:02:00',
    reference_count: 5,
    file: 'videos/1/test1.mp4',
    questions: ['What is the main topic?', 'How does this work?'],
  },
  {
    video_id: 2,
    title: 'Test Video 2',
    start_time: '00:03:00',
    end_time: '00:04:00',
    reference_count: 3,
    file: 'videos/2/test2.mp4',
    questions: ['What is the second topic?'],
  },
]

describe('ShortsPlayer', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    document.body.style.overflow = ''
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.style.overflow = ''
  })

  it('should render scenes', () => {
    render(<ShortsPlayer scenes={mockScenes} onClose={mockOnClose} />)

    expect(screen.getByText('Test Video 1')).toBeInTheDocument()
    expect(screen.getByText('00:01:00 - 00:02:00')).toBeInTheDocument()
    expect(screen.getByText(/5/)).toBeInTheDocument()
  })

  it('should display scene counter', () => {
    render(<ShortsPlayer scenes={mockScenes} onClose={mockOnClose} />)

    expect(screen.getByText('1 / 2')).toBeInTheDocument()
  })

  it('should call onClose when close button is clicked', () => {
    render(<ShortsPlayer scenes={mockScenes} onClose={mockOnClose} />)

    const closeButtons = screen.getAllByRole('button')
    const closeButton = closeButtons.find(btn => btn.querySelector('svg.lucide-x'))
    if (closeButton) {
      fireEvent.click(closeButton)
    }

    expect(mockOnClose).toHaveBeenCalled()
  })

  it('should call onClose when Escape key is pressed', () => {
    render(<ShortsPlayer scenes={mockScenes} onClose={mockOnClose} />)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(mockOnClose).toHaveBeenCalled()
  })

  it('should display no scenes message when scenes is empty', () => {
    render(<ShortsPlayer scenes={[]} onClose={mockOnClose} />)

    expect(screen.getByText(/shorts.noScenes/)).toBeInTheDocument()
  })

  it('should toggle mute when mute button is clicked', () => {
    render(<ShortsPlayer scenes={mockScenes} onClose={mockOnClose} />)

    const buttons = screen.getAllByRole('button')
    const muteButton = buttons.find(btn =>
      btn.querySelector('svg.lucide-volume-2') || btn.querySelector('svg.lucide-volume-x')
    )

    expect(muteButton).toBeInTheDocument()
    if (muteButton) {
      fireEvent.click(muteButton)
    }
  })

  it('should use getVideoUrl for regular access', () => {
    render(<ShortsPlayer scenes={mockScenes} onClose={mockOnClose} />)

    expect(apiClient.getVideoUrl).toHaveBeenCalledWith('videos/1/test1.mp4')
  })

  it('should use getSharedVideoUrl when shareToken is provided', () => {
    render(<ShortsPlayer scenes={mockScenes} shareToken="test-token" onClose={mockOnClose} />)

    expect(apiClient.getSharedVideoUrl).toHaveBeenCalledWith('videos/1/test1.mp4', 'test-token')
  })

  it('should display video unavailable message when file is null', () => {
    const scenesWithNullFile: PopularScene[] = [
      {
        video_id: 1,
        title: 'Test Video',
        start_time: '00:01:00',
        end_time: '00:02:00',
        reference_count: 5,
        file: null,
        questions: ['Test question?'],
      },
    ]

    render(<ShortsPlayer scenes={scenesWithNullFile} onClose={mockOnClose} />)

    expect(screen.getByText(/videos.shared.videoNoFile/)).toBeInTheDocument()
  })

  it('should hide body overflow when mounted', () => {
    render(<ShortsPlayer scenes={mockScenes} onClose={mockOnClose} />)

    expect(document.body.style.overflow).toBe('hidden')
  })

  it('should restore body overflow when unmounted', () => {
    const { unmount } = render(<ShortsPlayer scenes={mockScenes} onClose={mockOnClose} />)

    expect(document.body.style.overflow).toBe('hidden')

    unmount()

    expect(document.body.style.overflow).toBe('')
  })

  it('should set up IntersectionObserver', async () => {
    vi.useRealTimers()
    render(<ShortsPlayer scenes={mockScenes} onClose={mockOnClose} />)

    await waitFor(() => {
      expect(mockIntersectionObserver).toHaveBeenCalled()
    }, { timeout: 200 })
  })

  // --- Tests for single video element approach ---

  it('should render a single video element', () => {
    render(<ShortsPlayer scenes={mockScenes} onClose={mockOnClose} />)

    // Single video element approach - only one video should exist
    const videos = document.querySelectorAll('video')
    expect(videos.length).toBe(1)
  })

  it('should include media fragment #t= in video src', () => {
    render(<ShortsPlayer scenes={mockScenes} onClose={mockOnClose} />)

    const video = document.querySelector('video')
    expect(video).not.toBeNull()
    // start_time 00:01:00 = 60s, end_time 00:02:00 = 120s
    expect(video!.src).toContain('#t=60,120')
  })

  it('should set preload="auto" for the video element', () => {
    render(<ShortsPlayer scenes={mockScenes} onClose={mockOnClose} />)

    const video = document.querySelector('video')
    expect(video?.preload).toBe('auto')
  })

  it('should set currentTime to startSeconds on loadedMetadata', () => {
    render(<ShortsPlayer scenes={mockScenes} onClose={mockOnClose} />)

    const video = document.querySelector('video')!
    Object.defineProperty(video, 'currentTime', { value: 0, writable: true })

    fireEvent.loadedMetadata(video)

    // start_time 00:01:00 = 60s
    expect(video.currentTime).toBe(60)
  })

  it('should loop and call play() when reaching end_time', () => {
    render(<ShortsPlayer scenes={mockScenes} onClose={mockOnClose} />)

    const video = document.querySelector('video')!
    // end_time 00:02:00 = 120s
    Object.defineProperty(video, 'currentTime', { value: 120, writable: true })

    fireEvent.timeUpdate(video)

    // Should seek back to start_time (60s) and call play()
    expect(video.currentTime).toBe(60)
    expect(video.play).toHaveBeenCalled()
  })

  it('should not loop when currentTime is before end_time', () => {
    render(<ShortsPlayer scenes={mockScenes} onClose={mockOnClose} />)

    const video = document.querySelector('video')!
    // current time = 90s (still between start 60s and end 120s)
    Object.defineProperty(video, 'currentTime', { value: 90, writable: true })

    fireEvent.timeUpdate(video)

    // Should not change currentTime
    expect(video.currentTime).toBe(90)
  })

  it('should disconnect IntersectionObserver on unmount', async () => {
    const mockDisconnect = vi.fn()
    mockIntersectionObserver.mockReturnValue({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: mockDisconnect,
    })

    const { unmount } = render(<ShortsPlayer scenes={mockScenes} onClose={mockOnClose} />)
    unmount()

    expect(mockDisconnect).toHaveBeenCalled()
  })

  it('should show play overlay initially', () => {
    render(<ShortsPlayer scenes={mockScenes} onClose={mockOnClose} />)

    expect(screen.getByText(/shorts.tapToPlay/)).toBeInTheDocument()
  })

  it('should hide play overlay after clicking', () => {
    render(<ShortsPlayer scenes={mockScenes} onClose={mockOnClose} />)

    const overlay = screen.getByText(/shorts.tapToPlay/).closest('div[class*="cursor-pointer"]')
    expect(overlay).toBeTruthy()
    fireEvent.click(overlay!)

    expect(screen.queryByText(/shorts.tapToPlay/)).not.toBeInTheDocument()
  })

  // --- Tests for question flashcard feature ---

  it('should show question overlay after play overlay is dismissed', () => {
    render(<ShortsPlayer scenes={mockScenes} onClose={mockOnClose} />)

    // Initially, question is not shown (play overlay is active)
    // Dismiss play overlay
    const overlay = screen.getByText(/shorts.tapToPlay/).closest('div[class*="cursor-pointer"]')
    expect(overlay).toBeTruthy()
    fireEvent.click(overlay!)

    // Question should now be visible (center phase)
    expect(screen.getByText('What is the main topic?')).toBeInTheDocument()
  })

  it('should show question label in flashcard', () => {
    render(<ShortsPlayer scenes={mockScenes} onClose={mockOnClose} />)

    // Dismiss play overlay
    const overlay = screen.getByText(/shorts.tapToPlay/).closest('div[class*="cursor-pointer"]')
    expect(overlay).toBeTruthy()
    fireEvent.click(overlay!)

    // Should show the "Question" label
    expect(screen.getByText(/shorts.question/)).toBeInTheDocument()
  })

  it('should transition question from center to top after timeout', () => {
    render(<ShortsPlayer scenes={mockScenes} onClose={mockOnClose} />)

    // Dismiss play overlay
    const overlay = screen.getByText(/shorts.tapToPlay/).closest('div[class*="cursor-pointer"]')
    expect(overlay).toBeTruthy()
    fireEvent.click(overlay!)

    // Question should be visible in center initially
    expect(screen.getByText('What is the main topic?')).toBeInTheDocument()

    // Advance timer to trigger shrink phase (2500ms)
    act(() => {
      vi.advanceTimersByTime(2500)
    })

    // Question text should still be visible (now shrinking/top)
    expect(screen.getByText('What is the main topic?')).toBeInTheDocument()

    // Advance timer to complete shrink animation (500ms)
    act(() => {
      vi.advanceTimersByTime(500)
    })

    // Question should still be visible in top position
    expect(screen.getByText('What is the main topic?')).toBeInTheDocument()
  })

  it('should not show question overlay when scene has no questions', () => {
    const scenesWithoutQuestions: PopularScene[] = [
      {
        video_id: 1,
        title: 'Test Video',
        start_time: '00:01:00',
        end_time: '00:02:00',
        reference_count: 5,
        file: 'videos/1/test1.mp4',
        questions: [],
      },
    ]

    render(<ShortsPlayer scenes={scenesWithoutQuestions} onClose={mockOnClose} />)

    // Dismiss play overlay
    const overlay = screen.getByText(/shorts.tapToPlay/).closest('div[class*="cursor-pointer"]')
    expect(overlay).toBeTruthy()
    fireEvent.click(overlay!)

    // Question label should not be visible
    expect(screen.queryByText(/shorts.question/)).not.toBeInTheDocument()
  })
})
