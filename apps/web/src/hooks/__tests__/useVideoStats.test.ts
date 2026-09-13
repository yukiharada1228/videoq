import { renderHook, act, waitFor } from '@testing-library/react'
import type { VideoStatusCounts } from '@videoq/trpc'

import { useVideoStats, useVideoStatusCounts, EMPTY_VIDEO_STATUS_COUNTS } from '../useVideoStats'

describe('useVideoStats', () => {
  it('should calculate stats for empty array', () => {
    const { result } = renderHook(() => useVideoStats([]))
    
    expect(result.current).toEqual({
      total: 0,
      completed: 0,
      pending: 0,
      processing: 0,
      indexing: 0,
      error: 0,
    })
  })

  it('should calculate stats for videos with different statuses', () => {
    const videos = [
      { status: 'completed' as const },
      { status: 'completed' as const },
      { status: 'pending' as const },
      { status: 'processing' as const },
      { status: 'indexing' as const },
      { status: 'error' as const },
    ]
    
    const { result } = renderHook(() => useVideoStats(videos))
    
    expect(result.current).toEqual({
      total: 6,
      completed: 2,
      pending: 1,
      processing: 1,
      indexing: 1,
      error: 1,
    })
  })

  it('should recalculate when videos change', () => {
    const { result, rerender } = renderHook<
      ReturnType<typeof useVideoStats>,
      { videos: Array<{ status: 'completed' | 'pending' | 'processing' | 'indexing' | 'error' }> }
    >(
      ({ videos }) => useVideoStats(videos),
      {
        initialProps: {
          videos: [{ status: 'completed' as const }],
        },
      }
    )
    
    expect(result.current.total).toBe(1)
    expect(result.current.completed).toBe(1)
    
    rerender({
      videos: [
        { status: 'completed' as const },
        { status: 'pending' as const },
      ],
    })
    
    expect(result.current.total).toBe(2)
    expect(result.current.completed).toBe(1)
    expect(result.current.pending).toBe(1)
  })
})

describe('useVideoStatusCounts', () => {
  it('reads server-side status totals through tRPC', async () => {
    const stats: VideoStatusCounts = {
      total: 8,
      completed: 3,
      pending: 1,
      processing: 1,
      indexing: 1,
      error: 1,
      uploading: 1,
    }
    const getCounts = vi.fn(() => stats)
    globalThis.__setTrpcHandler('videos.statusCounts', getCounts)
    const { result } = renderHook(() => useVideoStatusCounts(true))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(getCounts).toHaveBeenCalledTimes(1)
    expect(result.current).toEqual({
      stats,
      isLoading: false,
      error: null,
    })
  })

  it.each(['pending', 'processing', 'indexing', 'uploading'] as const)(
    'automatically refetches while the %s count is non-zero',
    async (status) => {
      vi.useFakeTimers()
      try {
        const inProgressStats: VideoStatusCounts = { ...EMPTY_VIDEO_STATUS_COUNTS, total: 1, [status]: 1 }
        const settledStats: VideoStatusCounts = { ...EMPTY_VIDEO_STATUS_COUNTS, total: 1, completed: 1 }
        const getCounts = vi.fn()
          .mockResolvedValueOnce(inProgressStats)
          .mockResolvedValueOnce(settledStats)
        globalThis.__setTrpcHandler('videos.statusCounts', getCounts)

        renderHook(() => useVideoStatusCounts(true))

        await act(async () => {
          await vi.waitFor(() => expect(getCounts).toHaveBeenCalledTimes(1))
        })

        await act(async () => {
          await vi.advanceTimersByTimeAsync(3000)
        })

        await act(async () => {
          await vi.waitFor(() => expect(getCounts).toHaveBeenCalledTimes(2))
        })

        // counts are now all settled — polling should stop
        await act(async () => {
          await vi.advanceTimersByTimeAsync(10000)
        })
        expect(getCounts).toHaveBeenCalledTimes(2)
      } finally {
        vi.useRealTimers()
      }
    },
  )

  it('does not poll once no status is in progress', async () => {
    vi.useFakeTimers()
    try {
      const settledStats: VideoStatusCounts = { ...EMPTY_VIDEO_STATUS_COUNTS, total: 1, completed: 1 }
      const getCounts = vi.fn().mockResolvedValue(settledStats)
      globalThis.__setTrpcHandler('videos.statusCounts', getCounts)

      renderHook(() => useVideoStatusCounts(true))

      await act(async () => {
        await vi.waitFor(() => expect(getCounts).toHaveBeenCalledTimes(1))
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000)
      })
      expect(getCounts).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
