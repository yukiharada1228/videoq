import { renderHook, act, waitFor } from '@testing-library/react'
import { useVideoCourses } from '../useVideoCourses'
import { useAuth } from '@/hooks/useAuth'
import { useQueryClient } from '@tanstack/react-query'
import { trpc } from '@/lib/trpc'

const trpcApi = vi.hoisted(() => ({
  listCourses: vi.fn(),
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
    globalThis.__setTrpcHandler('courses.list', input => trpcApi.listCourses(input))
    ;(useAuth as any).mockReturnValue({ user: { id: 1 } })
  })

  it('stays loading while authentication is pending without fetching courses', async () => {
    ;(useAuth as any).mockReturnValue({ user: null, isLoading: true })
    trpcApi.listCourses.mockResolvedValue(mockPaginatedResponse([]))

    const { result, rerender } = renderHook(() => useVideoCourses())

    expect(result.current.courses).toEqual([])
    expect(result.current.isLoading).toBe(true)
    expect(trpcApi.listCourses).not.toHaveBeenCalled()
    ;(useAuth as any).mockReturnValue({ user: { id: 1 }, isLoading: false })
    rerender()
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(trpcApi.listCourses).toHaveBeenCalledTimes(1)
  })

  it('does not fetch when user is not available', () => {
    ;(useAuth as any).mockReturnValue({ user: null })
    trpcApi.listCourses.mockResolvedValue(mockPaginatedResponse([]))

    const { result } = renderHook(() => useVideoCourses())

    expect(result.current.courses).toEqual([])
    expect(trpcApi.listCourses).not.toHaveBeenCalled()
  })

  it('fetches the first page when enabled', async () => {
    const mockCourses = [{ id: 1, name: 'g1' }]
    trpcApi.listCourses.mockResolvedValue(mockPaginatedResponse(mockCourses))

    const { result } = renderHook(() => useVideoCourses())

    await waitFor(() => {
      expect(trpcApi.listCourses).toHaveBeenCalledWith(expect.objectContaining({ limit: 24, cursor: 0 }))
      expect(result.current.courses).toEqual(mockCourses)
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('stops pagination after an empty page even if the total is stale', async () => {
    trpcApi.listCourses.mockResolvedValue(mockPaginatedResponse([], 25))
    const { result } = renderHook(() => useVideoCourses())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    act(() => { result.current.sentinelRef(document.createElement('div')) })
    expect(result.current.courses).toEqual([])
    expect(trpcApi.listCourses).toHaveBeenCalledTimes(1)
  })

  it('uses the total and returned page size to stop after loading the last course', async () => {
    const mockCourses = Array.from({ length: 24 }, (_, i) => ({ id: i + 1, name: `g${i + 1}` }))
    trpcApi.listCourses.mockResolvedValueOnce(mockPaginatedResponse(mockCourses, 25, 0))
      .mockResolvedValueOnce(mockPaginatedResponse([{ id: 25, name: 'Last course' }], 25, 24))

    const { result } = renderHook(() => useVideoCourses())
    await waitFor(() => expect(result.current.courses).toHaveLength(24))
    act(() => { result.current.sentinelRef(document.createElement('div')) })

    await waitFor(() => expect(result.current.courses).toHaveLength(25))
    expect(trpcApi.listCourses.mock.calls.map(([input]) => input.cursor)).toEqual([0, 24])
  })

  it('refreshes course data after cache invalidation', async () => {
    const mockCourses1 = [{ id: 1, name: 'g1' }]
    const mockCourses2 = [{ id: 2, name: 'g2' }]
    trpcApi.listCourses
      .mockResolvedValueOnce(mockPaginatedResponse(mockCourses1))
      .mockResolvedValueOnce(mockPaginatedResponse(mockCourses2))

    const { result } = renderHook(() => ({
      ...useVideoCourses(),
      queryClient: useQueryClient(),
    }))

    await waitFor(() => {
      expect(result.current.courses).toEqual(mockCourses1)
    })

    await act(async () => {
      await result.current.queryClient.invalidateQueries(trpc.courses.list.pathFilter())
    })

    await waitFor(() => {
      expect(trpcApi.listCourses).toHaveBeenCalledTimes(2)
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
    globalThis.__setTrpcHandler('courses.list', input => trpcApi.listCourses(input))
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

    trpcApi.listCourses
      .mockResolvedValueOnce(mockPaginatedResponse(page1, 25, 0))
      .mockResolvedValueOnce(mockPaginatedResponse(page2, 25, 24))

    const { result } = renderHook(() => useVideoCourses())
    await waitFor(() => expect(result.current.courses).toHaveLength(24))

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
    trpcApi.listCourses.mockResolvedValue(mockPaginatedResponse([]))
    const { result } = renderHook(() => useVideoCourses())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const div = document.createElement('div')
    await act(async () => { result.current.sentinelRef(div) })
    await act(async () => { result.current.sentinelRef(null) })

    expect(mockDisconnect).toHaveBeenCalled()
  })
})
