import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { ShortsButton } from '../ShortsButton'
import { apiClient, type VideoInGroup, type PopularScene } from '@/lib/api'

// Mock apiClient
vi.mock('@/lib/api', () => ({
  apiClient: {
    getPopularScenes: vi.fn(),
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

const mockVideos: VideoInGroup[] = [
  {
    id: 1,
    title: 'Test Video 1',
    description: 'Description 1',
    file: 'videos/1/test1.mp4',
    uploaded_at: '2024-01-01T00:00:00Z',
    status: 'completed',
    order: 0,
  },
  {
    id: 2,
    title: 'Test Video 2',
    description: 'Description 2',
    file: 'videos/2/test2.mp4',
    uploaded_at: '2024-01-02T00:00:00Z',
    status: 'completed',
    order: 1,
  },
]

const mockPopularScenes: PopularScene[] = [
  {
    video_id: 1,
    title: 'Test Video 1',
    start_time: '00:01:00',
    end_time: '00:02:00',
    reference_count: 5,
    file: 'videos/1/test1.mp4',
  },
]

describe('ShortsButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(apiClient.getPopularScenes as any).mockResolvedValue(mockPopularScenes)
  })

  it('should render button with correct text', () => {
    render(<ShortsButton groupId={1} videos={mockVideos} />)

    expect(screen.getByText(/shorts.button/)).toBeInTheDocument()
  })

  it('should not render when videos is empty', () => {
    const { container } = render(<ShortsButton groupId={1} videos={[]} />)

    expect(container.firstChild).toBeNull()
  })

  it('should prefetch popular scenes on mount', async () => {
    render(<ShortsButton groupId={1} videos={mockVideos} />)

    await waitFor(() => {
      expect(apiClient.getPopularScenes).toHaveBeenCalledWith(1, undefined)
    })
  })

  it('should prefetch with shareToken when provided', async () => {
    render(<ShortsButton groupId={1} videos={mockVideos} shareToken="test-token" />)

    await waitFor(() => {
      expect(apiClient.getPopularScenes).toHaveBeenCalledWith(1, 'test-token')
    })
  })

  it('should open ShortsPlayer instantly using prefetched data', async () => {
    render(<ShortsButton groupId={1} videos={mockVideos} />)

    // Wait for prefetch to complete
    await waitFor(() => {
      expect(apiClient.getPopularScenes).toHaveBeenCalledTimes(1)
    })

    const button = screen.getByText(/shorts.button/)

    await act(async () => {
      fireEvent.click(button)
    })

    // Should open without additional API call (uses cache from prefetch)
    expect(apiClient.getPopularScenes).toHaveBeenCalledTimes(1)

    await waitFor(() => {
      expect(screen.getByText('Test Video 1')).toBeInTheDocument()
      expect(screen.getByText('00:01:00 - 00:02:00')).toBeInTheDocument()
    })
  })

  it('should handle API error gracefully on click when prefetch failed', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(apiClient.getPopularScenes as any).mockRejectedValue(new Error('API Error'))

    render(<ShortsButton groupId={1} videos={mockVideos} />)

    // Wait for prefetch to fail silently
    await waitFor(() => {
      expect(apiClient.getPopularScenes).toHaveBeenCalledTimes(1)
    })

    const button = screen.getByText(/shorts.button/)

    await act(async () => {
      fireEvent.click(button)
    })

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to load popular scenes:', expect.any(Error))
    })

    consoleErrorSpy.mockRestore()
  })

  it('should show loading state while fetching on click without cache', async () => {
    let resolveFirst: (value: PopularScene[]) => void
    let resolveSecond: (value: PopularScene[]) => void
    const firstPromise = new Promise<PopularScene[]>((resolve) => { resolveFirst = resolve })
    const secondPromise = new Promise<PopularScene[]>((resolve) => { resolveSecond = resolve })
    ;(apiClient.getPopularScenes as any)
      .mockReturnValueOnce(firstPromise)   // prefetch
      .mockReturnValueOnce(secondPromise)  // click

    render(<ShortsButton groupId={1} videos={mockVideos} />)

    const button = screen.getByRole('button')

    // Click before prefetch resolves - no cache available
    await act(async () => {
      fireEvent.click(button)
    })

    // Button should be disabled during loading
    expect(button).toBeDisabled()

    // Resolve both
    await act(async () => {
      resolveFirst!(mockPopularScenes)
      resolveSecond!(mockPopularScenes)
    })

    // Button should be enabled after loading
    await waitFor(() => {
      expect(button).not.toBeDisabled()
    })
  })

  it('should close ShortsPlayer when close button is clicked', async () => {
    render(<ShortsButton groupId={1} videos={mockVideos} />)

    const button = screen.getByText(/shorts.button/)

    await act(async () => {
      fireEvent.click(button)
    })

    await waitFor(() => {
      expect(screen.getByText('Test Video 1')).toBeInTheDocument()
    })

    // Find and click the close button (X icon)
    const allButtons = screen.getAllByRole('button')
    const closeButton = allButtons.find(btn => btn.querySelector('svg.lucide-x'))

    if (closeButton) {
      await act(async () => {
        fireEvent.click(closeButton)
      })
    }

    await waitFor(() => {
      // ShortsPlayer should be closed, so the scene title should not be visible
      // But the ShortsButton should still be there
      expect(screen.getByText(/shorts.button/)).toBeInTheDocument()
    })
  })

  it('should render with sm size', () => {
    render(<ShortsButton groupId={1} videos={mockVideos} size="sm" />)

    const button = screen.getByRole('button')
    expect(button).toBeInTheDocument()
  })

  it('should render with default size', () => {
    render(<ShortsButton groupId={1} videos={mockVideos} size="default" />)

    const button = screen.getByRole('button')
    expect(button).toBeInTheDocument()
  })

  // --- New tests for client-side caching ---

  it('should use prefetched cache on click without additional API call', async () => {
    render(<ShortsButton groupId={1} videos={mockVideos} />)

    // Wait for prefetch
    await waitFor(() => {
      expect(apiClient.getPopularScenes).toHaveBeenCalledTimes(1)
    })

    const button = screen.getByText(/shorts.button/)

    // First click - uses cache from prefetch
    await act(async () => {
      fireEvent.click(button)
    })
    expect(apiClient.getPopularScenes).toHaveBeenCalledTimes(1)

    // Close the player
    const allButtons = screen.getAllByRole('button')
    const closeButton = allButtons.find(btn => btn.querySelector('svg.lucide-x'))
    if (closeButton) {
      await act(async () => {
        fireEvent.click(closeButton)
      })
    }

    // Second click - still uses cache
    await act(async () => {
      fireEvent.click(screen.getByText(/shorts.button/))
    })

    expect(apiClient.getPopularScenes).toHaveBeenCalledTimes(1)

    // Player should still open with cached data
    await waitFor(() => {
      expect(screen.getByText('Test Video 1')).toBeInTheDocument()
    })
  })

  it('should re-fetch after cache expires', async () => {
    const originalDateNow = Date.now
    let now = originalDateNow()
    vi.spyOn(Date, 'now').mockImplementation(() => now)

    render(<ShortsButton groupId={1} videos={mockVideos} />)

    // Wait for prefetch (call 1)
    await waitFor(() => {
      expect(apiClient.getPopularScenes).toHaveBeenCalledTimes(1)
    })

    const button = screen.getByText(/shorts.button/)

    // Click within TTL - uses cache
    await act(async () => {
      fireEvent.click(button)
    })
    expect(apiClient.getPopularScenes).toHaveBeenCalledTimes(1)

    // Close the player
    const allButtons = screen.getAllByRole('button')
    const closeButton = allButtons.find(btn => btn.querySelector('svg.lucide-x'))
    if (closeButton) {
      await act(async () => {
        fireEvent.click(closeButton)
      })
    }

    // Advance past the 5 minute TTL
    now += 5 * 60 * 1000 + 1

    // Click again - cache expired, should call API again (call 2)
    await act(async () => {
      fireEvent.click(screen.getByText(/shorts.button/))
    })

    await waitFor(() => {
      expect(apiClient.getPopularScenes).toHaveBeenCalledTimes(2)
    })

    vi.restoreAllMocks()
  })
})
