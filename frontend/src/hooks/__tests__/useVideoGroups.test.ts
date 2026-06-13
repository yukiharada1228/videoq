import { renderHook, act, waitFor } from '@testing-library/react'
import { useVideoGroups } from '../useVideoGroups'
import { apiClient } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'

vi.mock('@/lib/api', () => ({
  apiClient: {
    getVideoGroupsPage: vi.fn(),
  },
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
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

describe('useVideoGroups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuth as any).mockReturnValue({ user: { id: 1 } })
  })

  it('does not fetch when trigger is false', () => {
    ;(apiClient.getVideoGroupsPage as any).mockResolvedValue(mockPaginatedResponse([]))

    const { result } = renderHook(({ trigger }) => useVideoGroups(trigger), {
      initialProps: { trigger: false },
    })

    expect(result.current.groups).toEqual([])
    expect(apiClient.getVideoGroupsPage).not.toHaveBeenCalled()
  })

  it('does not fetch when user is not available', () => {
    ;(useAuth as any).mockReturnValue({ user: null })
    ;(apiClient.getVideoGroupsPage as any).mockResolvedValue(mockPaginatedResponse([]))

    const { result } = renderHook(() => useVideoGroups(true))

    expect(result.current.groups).toEqual([])
    expect(apiClient.getVideoGroupsPage).not.toHaveBeenCalled()
  })

  it('fetches the first page when enabled', async () => {
    const mockGroups = [{ id: 1, name: 'g1' }]
    ;(apiClient.getVideoGroupsPage as any).mockResolvedValue(mockPaginatedResponse(mockGroups))

    const { result } = renderHook(() => useVideoGroups(true))

    await waitFor(() => {
      expect(apiClient.getVideoGroupsPage).toHaveBeenCalledWith({ limit: 24, offset: 0 })
      expect(result.current.groups).toEqual(mockGroups)
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('exposes hasNextPage and totalCount from the paginated response', async () => {
    const mockGroups = Array.from({ length: 24 }, (_, i) => ({ id: i + 1, name: `g${i + 1}` }))
    ;(apiClient.getVideoGroupsPage as any).mockResolvedValue(
      mockPaginatedResponse(mockGroups, 25, '/api/videos/groups/?limit=24&offset=24'),
    )

    const { result } = renderHook(() => useVideoGroups(true))

    await waitFor(() => {
      expect(result.current.hasNextPage).toBe(true)
      expect(result.current.totalCount).toBe(25)
    })
  })

  it('refetch triggers another request', async () => {
    const mockGroups1 = [{ id: 1, name: 'g1' }]
    const mockGroups2 = [{ id: 2, name: 'g2' }]
    ;(apiClient.getVideoGroupsPage as any)
      .mockResolvedValueOnce(mockPaginatedResponse(mockGroups1))
      .mockResolvedValueOnce(mockPaginatedResponse(mockGroups2))

    const { result } = renderHook(() => useVideoGroups(true))

    await waitFor(() => {
      expect(result.current.groups).toEqual(mockGroups1)
    })

    await act(async () => {
      await result.current.refetch()
    })

    await waitFor(() => {
      expect(apiClient.getVideoGroupsPage).toHaveBeenCalledTimes(2)
      expect(result.current.groups).toEqual(mockGroups2)
    })
  })
})

describe('useVideoGroups - sentinelRef', () => {
  let capturedCallback: IntersectionObserverCallback | undefined
  const mockObserve = vi.fn()
  const mockDisconnect = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuth as any).mockReturnValue({ user: { id: 1 } })
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

  it('fetches the next page when sentinel enters the viewport', async () => {
    const page1 = Array.from({ length: 24 }, (_, i) => ({ id: i + 1, name: `Group ${i + 1}` }))
    const page2 = [{ id: 25, name: 'Group 25' }]

    ;(apiClient.getVideoGroupsPage as any)
      .mockResolvedValueOnce(mockPaginatedResponse(page1, 25, '/api/videos/groups/?limit=24&offset=24'))
      .mockResolvedValueOnce(mockPaginatedResponse(page2, 25, null))

    const { result } = renderHook(() => useVideoGroups(true))
    await waitFor(() => expect(result.current.hasNextPage).toBe(true))

    const div = document.createElement('div')
    await act(async () => { result.current.sentinelRef(div) })

    act(() => {
      capturedCallback!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    })

    await waitFor(() => {
      expect(result.current.groups).toHaveLength(25)
    })
  })

  it('disconnects observer when sentinel is detached', async () => {
    ;(apiClient.getVideoGroupsPage as any).mockResolvedValue(mockPaginatedResponse([]))
    const { result } = renderHook(() => useVideoGroups(true))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const div = document.createElement('div')
    await act(async () => { result.current.sentinelRef(div) })
    await act(async () => { result.current.sentinelRef(null) })

    expect(mockDisconnect).toHaveBeenCalled()
  })
})
