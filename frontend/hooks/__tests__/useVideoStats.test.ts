import { renderHook } from '@testing-library/react'
import { useVideoStats } from '../useVideoStats'

describe('useVideoStats', () => {
  it('should calculate stats for empty array', () => {
    const { result } = renderHook(() => useVideoStats([]))
    
    expect(result.current).toEqual({
      total: 0,
      completed: 0,
      pending: 0,
      processing: 0,
      error: 0,
    })
  })

  it('should calculate stats for videos with different statuses', () => {
    const videos = [
      { status: 'completed' as const },
      { status: 'completed' as const },
      { status: 'pending' as const },
      { status: 'processing' as const },
      { status: 'error' as const },
    ]
    
    const { result } = renderHook(() => useVideoStats(videos))
    
    expect(result.current).toEqual({
      total: 5,
      completed: 2,
      pending: 1,
      processing: 1,
      error: 1,
    })
  })

  it('should recalculate when videos change', () => {
    const { result, rerender } = renderHook<
      ReturnType<typeof useVideoStats>,
      { videos: Array<{ status: 'completed' | 'pending' | 'processing' | 'error' }> }
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

