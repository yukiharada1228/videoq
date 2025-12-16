import { renderHook, act, waitFor } from '@testing-library/react'
import { useVideoGroups } from '../useVideoGroups'
import { apiClient } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'

jest.mock('@/lib/api', () => ({
  apiClient: {
    getVideoGroups: jest.fn(),
  },
}))

jest.mock('@/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}))

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useVideoGroups', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(useAuth as jest.Mock).mockReturnValue({ user: { id: 1 } })
  })

  it('does not fetch when trigger is false', async () => {
    ;(apiClient.getVideoGroups as jest.Mock).mockResolvedValue([])

    const { result } = renderHook(({ trigger }) => useVideoGroups(trigger), {
      initialProps: { trigger: false },
    })

    expect(result.current.groups).toEqual([])
    expect(apiClient.getVideoGroups).not.toHaveBeenCalled()
  })

  it('does not fetch when user is not available', async () => {
    ;(useAuth as jest.Mock).mockReturnValue({ user: null })
    ;(apiClient.getVideoGroups as jest.Mock).mockResolvedValue([])

    const { result } = renderHook(() => useVideoGroups(true))

    expect(result.current.groups).toEqual([])
    expect(apiClient.getVideoGroups).not.toHaveBeenCalled()

    // refetch should also no-op
    act(() => {
      result.current.refetch()
    })
    expect(apiClient.getVideoGroups).not.toHaveBeenCalled()
  })

  it('fetches when trigger is true and user exists', async () => {
    const mockGroups = [{ id: 1, name: 'g1' }]
    ;(apiClient.getVideoGroups as jest.Mock).mockResolvedValue(mockGroups)

    const { result } = renderHook(() => useVideoGroups(true))

    await waitFor(() => {
      expect(apiClient.getVideoGroups).toHaveBeenCalledTimes(1)
      expect(result.current.groups).toEqual(mockGroups)
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('refetches when trigger toggles false -> true (modal reopen)', async () => {
    const mockGroups1 = [{ id: 1, name: 'g1' }]
    const mockGroups2 = [{ id: 2, name: 'g2' }]
    ;(apiClient.getVideoGroups as jest.Mock)
      .mockResolvedValueOnce(mockGroups1)
      .mockResolvedValueOnce(mockGroups2)

    const { result, rerender } = renderHook(({ trigger }) => useVideoGroups(trigger), {
      initialProps: { trigger: true },
    })

    await waitFor(() => {
      expect(apiClient.getVideoGroups).toHaveBeenCalledTimes(1)
      expect(result.current.groups).toEqual(mockGroups1)
    })

    // close
    rerender({ trigger: false })
    expect(apiClient.getVideoGroups).toHaveBeenCalledTimes(1)

    // reopen -> should refetch
    rerender({ trigger: true })

    await waitFor(() => {
      expect(apiClient.getVideoGroups).toHaveBeenCalledTimes(2)
      expect(result.current.groups).toEqual(mockGroups2)
    })
  })

  it('allows retry after an error (does not cache failed user)', async () => {
    const mockGroups = [{ id: 1, name: 'g1' }]
    ;(apiClient.getVideoGroups as jest.Mock)
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(mockGroups)

    const { result, rerender } = renderHook(({ trigger }) => useVideoGroups(trigger), {
      initialProps: { trigger: true },
    })

    await waitFor(() => {
      expect(apiClient.getVideoGroups).toHaveBeenCalledTimes(1)
      expect(result.current.isLoading).toBe(false)
      expect(result.current.groups).toEqual([])
    })

    // toggle to retrigger
    rerender({ trigger: false })
    rerender({ trigger: true })

    await waitFor(() => {
      expect(apiClient.getVideoGroups).toHaveBeenCalledTimes(2)
      expect(result.current.groups).toEqual(mockGroups)
    })
  })

  it('does not set state after unmount (then path)', async () => {
    const d = createDeferred<unknown[]>()
    ;(apiClient.getVideoGroups as jest.Mock).mockReturnValue(d.promise)

    const { unmount } = renderHook(() => useVideoGroups(true))

    unmount()

    await act(async () => {
      d.resolve([{ id: 1 }])
      await d.promise
    })
  })

  it('does not set state after unmount (catch path)', async () => {
    const d = createDeferred<unknown[]>()
    ;(apiClient.getVideoGroups as jest.Mock).mockReturnValue(d.promise)

    const { unmount } = renderHook(() => useVideoGroups(true))

    unmount()

    await act(async () => {
      d.reject(new Error('fail'))
      try {
        await d.promise
      } catch {
        // expected
      }
    })
  })

  it('refetch() triggers another request', async () => {
    const mockGroups1 = [{ id: 1, name: 'g1' }]
    const mockGroups2 = [{ id: 2, name: 'g2' }]
    ;(apiClient.getVideoGroups as jest.Mock)
      .mockResolvedValueOnce(mockGroups1)
      .mockResolvedValueOnce(mockGroups2)

    const { result } = renderHook(() => useVideoGroups(true))

    await waitFor(() => {
      expect(apiClient.getVideoGroups).toHaveBeenCalledTimes(1)
      expect(result.current.groups).toEqual(mockGroups1)
    })

    await act(async () => {
      result.current.refetch()
    })

    await waitFor(() => {
      expect(apiClient.getVideoGroups).toHaveBeenCalledTimes(2)
      expect(result.current.groups).toEqual(mockGroups2)
    })
  })
})

