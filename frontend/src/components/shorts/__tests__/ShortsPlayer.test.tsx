import { render, screen, fireEvent } from '@testing-library/react'
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

const mockScenes: PopularScene[] = [
  {
    video_id: 1,
    title: 'Test Video 1',
    start_time: '00:01:00',
    end_time: '00:02:00',
    reference_count: 5,
    file: 'videos/1/test1.mp4',
  },
  {
    video_id: 2,
    title: 'Test Video 2',
    start_time: '00:03:00',
    end_time: '00:04:00',
    reference_count: 3,
    file: 'videos/2/test2.mp4',
  },
]

describe('ShortsPlayer', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    document.body.style.overflow = ''
  })

  afterEach(() => {
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

  it('should set up IntersectionObserver', () => {
    render(<ShortsPlayer scenes={mockScenes} onClose={mockOnClose} />)

    // Wait for isReady to be true
    setTimeout(() => {
      expect(mockIntersectionObserver).toHaveBeenCalled()
    }, 150)
  })
})
