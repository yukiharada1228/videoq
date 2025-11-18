import { renderHook, act, waitFor } from '@testing-library/react'
import { useVideos, useVideo } from '../useVideos'
import { apiClient } from '@/lib/api'

// Mock apiClient
jest.mock('@/lib/api', () => ({
  apiClient: {
    getVideos: jest.fn(),
    getVideo: jest.fn(),
    isAuthenticated: jest.fn(),
  },
}))

// Mock next/navigation
const mockPush = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

describe('useVideos', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should initialize with empty videos array', () => {
    const { result } = renderHook(() => useVideos())

    expect(result.current.videos).toEqual([])
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('should load videos', async () => {
    const mockVideos = [
      { id: 1, title: 'Video 1', user: 1, file: '', uploaded_at: '', status: 'completed' as const },
      { id: 2, title: 'Video 2', user: 1, file: '', uploaded_at: '', status: 'completed' as const },
    ]
    ;(apiClient.getVideos as jest.Mock).mockResolvedValue(mockVideos)

    const { result } = renderHook(() => useVideos())

    await act(async () => {
      await result.current.loadVideos()
    })

    await waitFor(() => {
      expect(result.current.videos).toEqual(mockVideos)
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('should handle loading errors', async () => {
    const error = new Error('Failed to load')
    ;(apiClient.getVideos as jest.Mock).mockRejectedValue(error)

    const { result } = renderHook(() => useVideos())

    await act(async () => {
      try {
        await result.current.loadVideos()
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

describe('useVideo', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should initialize with null video', () => {
    const { result } = renderHook(() => useVideo(1))

    expect(result.current.video).toBeNull()
    expect(result.current.isLoading).toBe(false)
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
    ;(apiClient.isAuthenticated as jest.Mock).mockReturnValue(true)
    ;(apiClient.getVideo as jest.Mock).mockResolvedValue(mockVideo)

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
    ;(apiClient.isAuthenticated as jest.Mock).mockReturnValue(false)

    const { result } = renderHook(() => useVideo(1))

    await act(async () => {
      try {
        await result.current.loadVideo()
      } catch {
        // Expected to throw
      }
    })

    expect(mockPush).toHaveBeenCalledWith('/login')
  })

  it('should handle loading errors', async () => {
    ;(apiClient.isAuthenticated as jest.Mock).mockReturnValue(true)
    ;(apiClient.getVideo as jest.Mock).mockRejectedValue(new Error('Failed to load'))

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

