import { renderHook, act, waitFor } from '@testing-library/react'
import { useVideos, useVideo } from '../useVideos'
import { apiClient } from '@/lib/api'
import { useI18nNavigate } from '@/lib/i18n'

// Mock apiClient
vi.mock('@/lib/api', () => ({
  apiClient: {
    getVideos: vi.fn(),
    getVideo: vi.fn(),
    isAuthenticated: vi.fn(),
  },
}))

const mockPaginatedResponse = (
  results: any[],
  count = results.length,
  next: string | null = null,
) => ({
  count,
  next,
  previous: null,
  results,
})

describe('useVideos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should initialize with empty videos and loading state', () => {
    ;(apiClient.getVideos as any).mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useVideos())

    expect(result.current.videos).toEqual([])
    expect(result.current.isLoading).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('should load videos from first page', async () => {
    const mockVideos = [
      { id: 1, title: 'Video 1', user: 1, file: '', uploaded_at: '', status: 'completed' as const },
      { id: 2, title: 'Video 2', user: 1, file: '', uploaded_at: '', status: 'completed' as const },
    ]
    ;(apiClient.getVideos as any).mockResolvedValue(mockPaginatedResponse(mockVideos))

    const { result } = renderHook(() => useVideos())

    await waitFor(() => {
      expect(result.current.videos).toEqual(mockVideos)
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('should set hasNextPage to true when next is not null', async () => {
    const mockVideos = Array.from({ length: 24 }, (_, i) => ({
      id: i + 1,
      title: `Video ${i + 1}`,
      user: 1,
      file: '',
      uploaded_at: '',
      status: 'completed' as const,
    }))
    ;(apiClient.getVideos as any).mockResolvedValue(
      mockPaginatedResponse(mockVideos, 25, '/api/videos/?limit=24&offset=24'),
    )

    const { result } = renderHook(() => useVideos())

    await waitFor(() => {
      expect(result.current.hasNextPage).toBe(true)
    })
  })

  it('should set hasNextPage to false when next is null', async () => {
    const mockVideos = [
      { id: 1, title: 'Video 1', user: 1, file: '', uploaded_at: '', status: 'completed' as const },
    ]
    ;(apiClient.getVideos as any).mockResolvedValue(mockPaginatedResponse(mockVideos, 1, null))

    const { result } = renderHook(() => useVideos())

    await waitFor(() => {
      expect(result.current.hasNextPage).toBe(false)
    })
  })

  it('should expose totalCount from API response', async () => {
    const mockVideos = [
      { id: 1, title: 'Video 1', user: 1, file: '', uploaded_at: '', status: 'completed' as const },
    ]
    ;(apiClient.getVideos as any).mockResolvedValue(mockPaginatedResponse(mockVideos, 42))

    const { result } = renderHook(() => useVideos())

    await waitFor(() => {
      expect(result.current.totalCount).toBe(42)
    })
  })

  it('should pass tags param to API', async () => {
    ;(apiClient.getVideos as any).mockResolvedValue(mockPaginatedResponse([]))

    renderHook(() => useVideos({ tagIds: [1, 2] }))

    await waitFor(() => {
      expect(apiClient.getVideos).toHaveBeenCalledWith(
        expect.objectContaining({ tags: [1, 2] }),
      )
    })
  })

  it('should pass q param to API', async () => {
    ;(apiClient.getVideos as any).mockResolvedValue(mockPaginatedResponse([]))

    renderHook(() => useVideos({ q: 'test query' }))

    await waitFor(() => {
      expect(apiClient.getVideos).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'test query' }),
      )
    })
  })

  it('should pass ordering param to API', async () => {
    ;(apiClient.getVideos as any).mockResolvedValue(mockPaginatedResponse([]))

    renderHook(() => useVideos({ ordering: 'uploaded_at_asc' }))

    await waitFor(() => {
      expect(apiClient.getVideos).toHaveBeenCalledWith(
        expect.objectContaining({ ordering: 'uploaded_at_asc' }),
      )
    })
  })

  it('should pass limit=24 and offset=0 to API on first page', async () => {
    ;(apiClient.getVideos as any).mockResolvedValue(mockPaginatedResponse([]))

    renderHook(() => useVideos())

    await waitFor(() => {
      expect(apiClient.getVideos).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 24, offset: 0 }),
      )
    })
  })

  it('should load next page when fetchNextPage is called', async () => {
    const page1 = Array.from({ length: 24 }, (_, i) => ({
      id: i + 1,
      title: `Video ${i + 1}`,
      user: 1,
      file: '',
      uploaded_at: '',
      status: 'completed' as const,
    }))
    const page2 = [
      { id: 25, title: 'Video 25', user: 1, file: '', uploaded_at: '', status: 'completed' as const },
    ]

    ;(apiClient.getVideos as any)
      .mockResolvedValueOnce(
        mockPaginatedResponse(page1, 25, '/api/videos/?limit=24&offset=24'),
      )
      .mockResolvedValueOnce(mockPaginatedResponse(page2, 25, null))

    const { result } = renderHook(() => useVideos())

    await waitFor(() => expect(result.current.videos).toHaveLength(24))

    await act(async () => {
      result.current.fetchNextPage()
    })

    await waitFor(() => {
      expect(result.current.videos).toHaveLength(25)
      expect(apiClient.getVideos).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 24, offset: 0 }),
      )
      expect(apiClient.getVideos).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 24, offset: 24 }),
      )
    })
  })

  it('should flatten videos from multiple pages', async () => {
    const page1 = Array.from({ length: 24 }, (_, i) => ({
      id: i + 1,
      title: `Video ${i + 1}`,
      user: 1,
      file: '',
      uploaded_at: '',
      status: 'completed' as const,
    }))
    const page2 = Array.from({ length: 5 }, (_, i) => ({
      id: i + 25,
      title: `Video ${i + 25}`,
      user: 1,
      file: '',
      uploaded_at: '',
      status: 'completed' as const,
    }))

    ;(apiClient.getVideos as any)
      .mockResolvedValueOnce(
        mockPaginatedResponse(page1, 29, '/api/videos/?limit=24&offset=24'),
      )
      .mockResolvedValueOnce(mockPaginatedResponse(page2, 29, null))

    const { result } = renderHook(() => useVideos())

    await waitFor(() => expect(result.current.videos).toHaveLength(24))

    await act(async () => {
      result.current.fetchNextPage()
    })

    await waitFor(() => {
      expect(result.current.videos).toHaveLength(29)
      expect(result.current.videos[0].id).toBe(1)
      expect(result.current.videos[24].id).toBe(25)
    })
  })

  it('should handle loading errors', async () => {
    const error = new Error('Failed to load')
    ;(apiClient.getVideos as any).mockRejectedValue(error)

    const { result } = renderHook(() => useVideos())

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to load')
      expect(result.current.isLoading).toBe(false)
    })
  })
})

describe('useVideos - sentinelRef', () => {
  let capturedCallback: IntersectionObserverCallback | undefined
  const mockObserve = vi.fn()
  const mockDisconnect = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    capturedCallback = undefined
    mockObserve.mockClear()
    mockDisconnect.mockClear()

    Object.defineProperty(window, 'IntersectionObserver', {
      writable: true,
      configurable: true,
      value: vi.fn((callback: IntersectionObserverCallback) => {
        capturedCallback = callback
        return { observe: mockObserve, unobserve: vi.fn(), disconnect: mockDisconnect }
      }),
    })
  })

  it('should return a sentinelRef function', async () => {
    ;(apiClient.getVideos as any).mockResolvedValue(mockPaginatedResponse([]))
    const { result } = renderHook(() => useVideos())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(typeof result.current.sentinelRef).toBe('function')
  })

  it('should observe the sentinel element when attached', async () => {
    ;(apiClient.getVideos as any).mockResolvedValue(mockPaginatedResponse([]))
    const { result } = renderHook(() => useVideos())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const div = document.createElement('div')
    await act(async () => { result.current.sentinelRef(div) })

    expect(mockObserve).toHaveBeenCalledWith(div)
  })

  it('should fetch next page when sentinel enters the viewport', async () => {
    const page1 = Array.from({ length: 24 }, (_, i) => ({
      id: i + 1,
      title: `Video ${i + 1}`,
      user: 1,
      file: '',
      uploaded_at: '',
      status: 'completed' as const,
    }))
    const page2 = [{ id: 25, title: 'Video 25', user: 1, file: '', uploaded_at: '', status: 'completed' as const }]

    ;(apiClient.getVideos as any)
      .mockResolvedValueOnce(mockPaginatedResponse(page1, 25, '/api/videos/?limit=24&offset=24'))
      .mockResolvedValueOnce(mockPaginatedResponse(page2, 25, null))

    const { result } = renderHook(() => useVideos())
    await waitFor(() => expect(result.current.hasNextPage).toBe(true))

    const div = document.createElement('div')
    await act(async () => { result.current.sentinelRef(div) })

    act(() => {
      capturedCallback!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    })

    await waitFor(() => {
      expect(result.current.videos).toHaveLength(25)
    })
  })

  it('should not make duplicate API requests on rapid intersections while fetching', async () => {
    const page1 = Array.from({ length: 24 }, (_, i) => ({
      id: i + 1,
      title: `Video ${i + 1}`,
      user: 1,
      file: '',
      uploaded_at: '',
      status: 'completed' as const,
    }))

    let resolvePage2!: (value: any) => void
    const page2Promise = new Promise<any>(resolve => { resolvePage2 = resolve })

    ;(apiClient.getVideos as any)
      .mockResolvedValueOnce(mockPaginatedResponse(page1, 25, '/api/videos/?limit=24&offset=24'))
      .mockReturnValueOnce(page2Promise)

    const { result } = renderHook(() => useVideos())
    await waitFor(() => expect(result.current.hasNextPage).toBe(true))

    const div = document.createElement('div')
    await act(async () => { result.current.sentinelRef(div) })

    // First intersection — starts page 2 fetch
    act(() => {
      capturedCallback!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    })

    // Wait for isFetchingNextPage to become true (effect re-runs → new observer with guard)
    await waitFor(() => expect(result.current.isFetchingNextPage).toBe(true))

    // Second intersection while still fetching — guard should prevent duplicate
    act(() => {
      capturedCallback!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    })

    // Resolve page 2
    await act(async () => {
      resolvePage2(mockPaginatedResponse(
        [{ id: 25, title: 'Video 25', user: 1, file: '', uploaded_at: '', status: 'completed' as const }],
        25,
        null,
      ))
    })

    await waitFor(() => expect(result.current.isFetchingNextPage).toBe(false))

    // initial fetch (1) + page 2 (1) = 2 total — no duplicate page 2 request
    expect(apiClient.getVideos).toHaveBeenCalledTimes(2)
  })

  it('should disconnect observer when sentinel is detached', async () => {
    ;(apiClient.getVideos as any).mockResolvedValue(mockPaginatedResponse([]))
    const { result } = renderHook(() => useVideos())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const div = document.createElement('div')
    await act(async () => { result.current.sentinelRef(div) })
    await act(async () => { result.current.sentinelRef(null) })

    expect(mockDisconnect).toHaveBeenCalled()
  })
})

describe('useVideo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as any).__setMockPathname?.('/')
    window.history.pushState({}, '', '/')
  })

  it('should initialize with null video', () => {
    ;(apiClient.isAuthenticated as any).mockReturnValue(true)
    ;(apiClient.getVideo as any).mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useVideo(1))

    expect(result.current.video).toBeNull()
    expect(result.current.isLoading).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('should not load video if videoId is null', async () => {
    const { result } = renderHook(() => useVideo(null))

    await act(async () => {
      await result.current.loadVideo()
    })

    expect(apiClient.getVideo).not.toHaveBeenCalled()
  })

  it('should load video', async () => {
    const mockVideo = {
      id: 1,
      title: 'Test Video',
      user: 1,
      file: '',
      uploaded_at: '',
      status: 'completed' as const,
    }
    ;(apiClient.isAuthenticated as any).mockReturnValue(true)
    ;(apiClient.getVideo as any).mockResolvedValue(mockVideo)

    const { result } = renderHook(() => useVideo(1))

    await act(async () => {
      await result.current.loadVideo()
    })

    await waitFor(() => {
      expect(result.current.video).toEqual(mockVideo)
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('should redirect to login if not authenticated', async () => {
    ;(apiClient.isAuthenticated as any).mockReturnValue(false)

    const { result } = renderHook(() => useVideo(1))

    await act(async () => {
      try {
        await result.current.loadVideo()
      } catch {
        // Expected to throw
      }
    })

    const navigate = useI18nNavigate()
    expect(navigate).toHaveBeenCalledWith('/login')
  })

  it('should handle loading errors', async () => {
    ;(apiClient.isAuthenticated as any).mockReturnValue(true)
    ;(apiClient.getVideo as any).mockRejectedValue(new Error('Failed to load'))

    const { result } = renderHook(() => useVideo(1))

    await act(async () => {
      try {
        await result.current.loadVideo()
      } catch {
        // Expected to throw
      }
    })

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to load')
      expect(result.current.isLoading).toBe(false)
    })
  })
})
