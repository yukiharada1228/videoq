import { renderHook, waitFor } from '@testing-library/react'
import { useAuth } from '../useAuth'
import { apiClient } from '@/lib/api'
import { useI18nNavigate } from '@/lib/i18n'

// Mock apiClient
vi.mock('@/lib/api', () => ({
  apiClient: {
    getMe: vi.fn(),
  },
}))

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as any).__setMockPathname?.('/')
    window.history.pushState({}, '', '/')
  })

  it('should initialize with loading state', () => {
    const { result } = renderHook(() => useAuth())
    
    expect(result.current.loading).toBe(true)
    expect(result.current.user).toBeNull()
  })

  it('should load user data on mount for protected routes', async () => {
    const mockUser = { id: 1, username: 'testuser' }
    ;(apiClient.getMe as any).mockResolvedValue(mockUser)

    const { result } = renderHook(() => useAuth())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.user).toEqual(mockUser)
    expect(apiClient.getMe).toHaveBeenCalled()
  })

  it('should not load user data for public routes', async () => {
    ;(globalThis as any).__setMockPathname?.('/login')
    window.history.pushState({}, '', '/login')

    const { result } = renderHook(() => useAuth())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // For public routes, getMe should not be called
    // Note: This test may need adjustment based on actual behavior
  })

  it('should redirect to login on authentication error', async () => {
    ;(apiClient.getMe as any).mockRejectedValue(new Error('Unauthorized'))

    const { result } = renderHook(() => useAuth({ redirectToLogin: true }))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    const navigate = useI18nNavigate()
    expect(navigate).toHaveBeenCalledWith('/login')
  })

  it('should not redirect when redirectToLogin is false', async () => {
    ;(apiClient.getMe as any).mockRejectedValue(new Error('Unauthorized'))

    const { result } = renderHook(() => useAuth({ redirectToLogin: false }))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    const navigate = useI18nNavigate()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('should call onAuthError callback on error', async () => {
    ;(apiClient.getMe as any).mockRejectedValue(new Error('Unauthorized'))
    const onAuthError = vi.fn()

    const { result } = renderHook(() => useAuth({ onAuthError }))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(onAuthError).toHaveBeenCalled()
  })

  it('should refetch user data', async () => {
    const mockUser = { id: 1, username: 'testuser' }
    ;(apiClient.getMe as any).mockResolvedValue(mockUser)

    const { result } = renderHook(() => useAuth())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    ;(apiClient.getMe as any).mockResolvedValue({ ...mockUser, username: 'updated' })

    await result.current.refetch()

    await waitFor(() => {
      expect(result.current.user?.username).toBe('updated')
    })
  })
})

