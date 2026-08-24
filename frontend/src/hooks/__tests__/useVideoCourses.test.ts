import { renderHook, act, waitFor } from '@testing-library/react'
import { useVideoCourses } from '../useVideoCourses'
import { apiClient } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'

vi.mock('@/lib/api', () => ({
  apiClient: {
    getVideoCoursesPage: vi.fn(),
  },
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

const mockPaginatedResponse = (
  data: any[],
  total?: number,
  offset = 0,
) => ({
  data,
  meta: {
    total: total ?? data.length,
    limit: 24,
    offset,
  },
})

describe('useVideoCourses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuth as any).mockReturnValue({ user: { id: 1 } })
  })

  it('does not fetch when trigger is false', () => {
    ;(apiClient.getVideoCoursesPage as any).mockResolvedValue(mockPaginatedResponse([]))

    const { result } = renderHook(({ trigger }) => useVideoCourses(trigger), {
      initialProps: { trigger: false },
    })

    expect(result.current.courses).toEqual([])
    expect(apiClient.getVideoCoursesPage).not.toHaveBeenCalled()
  })

  it('does not fetch when user is not available', () => {
    ;(useAuth as any).mockReturnValue({ user: null })
    ;(apiClient.getVideoCoursesPage as any).mockResolvedValue(mockPaginatedResponse([]))

    const { result } = renderHook(() => useVideoCourses(true))

    expect(result.current.courses).toEqual([])
    expect(apiClient.getVideoCoursesPage).not.toHaveBeenCalled()
  })

  it('fetches the first page when enabled', async () => {
    const mockCourses = [{ id: 1, name: 'g1' }]
    ;(apiClient.getVideoCoursesPage as any).mockResolvedValue(mockPaginatedResponse(mockCourses))

    const { result } = renderHook(() => useVideoCourses(true))

    await waitFor(() => {
      expect(apiClient.getVideoCoursesPage).toHaveBeenCalledWith({ limit: 24, offset: 0 })
      expect(result.current.courses).toEqual(mockCourses)
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('exposes hasNextPage and totalCount from the paginated response', async () => {
    const mockCourses = Array.from({ length: 24 }, (_, i) => ({ id: i + 1, name: `g${i + 1}` }))
    ;(apiClient.getVideoCoursesPage as any).mockResolvedValue(
      mockPaginatedResponse(mockCourses, 25, 0),
    )

    const { result } = renderHook(() => useVideoCourses(true))

    await waitFor(() => {
      expect(result.current.hasNextPage).toBe(true)
      expect(result.current.totalCount).toBe(25)
    })
  })

  it('refetch triggers another request', async () => {
    const mockCourses1 = [{ id: 1, name: 'g1' }]
    const mockCourses2 = [{ id: 2, name: 'g2' }]
    ;(apiClient.getVideoCoursesPage as any)
      .mockResolvedValueOnce(mockPaginatedResponse(mockCourses1))
      .mockResolvedValueOnce(mockPaginatedResponse(mockCourses2))

    const { result } = renderHook(() => useVideoCourses(true))

    await waitFor(() => {
      expect(result.current.courses).toEqual(mockCourses1)
    })

    await act(async () => {
      await result.current.refetch()
    })

    await waitFor(() => {
      expect(apiClient.getVideoCoursesPage).toHaveBeenCalledTimes(2)
      expect(result.current.courses).toEqual(mockCourses2)
    })
  })
})

describe('useVideoCourses - sentinelRef', () => {
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
    const page1 = Array.from({ length: 24 }, (_, i) => ({ id: i + 1, name: `Course ${i + 1}` }))
    const page2 = [{ id: 25, name: 'Course 25' }]

    ;(apiClient.getVideoCoursesPage as any)
      .mockResolvedValueOnce(mockPaginatedResponse(page1, 25, 0))
      .mockResolvedValueOnce(mockPaginatedResponse(page2, 25, 24))

    const { result } = renderHook(() => useVideoCourses(true))
    await waitFor(() => expect(result.current.hasNextPage).toBe(true))

    const div = document.createElement('div')
    await act(async () => { result.current.sentinelRef(div) })

    act(() => {
      capturedCallback!([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    })

    await waitFor(() => {
      expect(result.current.courses).toHaveLength(25)
    })
  })

  it('disconnects observer when sentinel is detached', async () => {
    ;(apiClient.getVideoCoursesPage as any).mockResolvedValue(mockPaginatedResponse([]))
    const { result } = renderHook(() => useVideoCourses(true))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const div = document.createElement('div')
    await act(async () => { result.current.sentinelRef(div) })
    await act(async () => { result.current.sentinelRef(null) })

    expect(mockDisconnect).toHaveBeenCalled()
  })
})
