import { renderHook, waitFor } from '@testing-library/react'
import { useAuth } from '../useAuth'
import { apiClient } from '@/lib/api'
import { useI18nNavigate } from '@/lib/i18n'

vi.mock('@/lib/api', () => ({
  apiClient: {
    getMeOrNull: vi.fn(),
  },
}))

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as any).__setMockPathname?.('/')
    ;(globalThis as any).__setMockAuthSession?.({
      user: { id: '1', name: 'testuser', email: 'test@example.com' },
    })
    window.history.pushState({}, '', '/')
  })

  it('should initialize with loading state', () => {
    ;(apiClient.getMeOrNull as any).mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useAuth())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.user).toBeNull()
  })

  it('should load user data on mount for protected routes', async () => {
    const mockUser = { id: 1, username: 'testuser' }
    ;(apiClient.getMeOrNull as any).mockResolvedValue(mockUser)

    const { result } = renderHook(() => useAuth())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.user).toEqual(mockUser)
    expect(apiClient.getMeOrNull).toHaveBeenCalled()
  })

  it('should not load user data for public routes', async () => {
    ;(globalThis as any).__setMockPathname?.('/login')
    window.history.pushState({}, '', '/login')

    const { result } = renderHook(() => useAuth())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(apiClient.getMeOrNull).not.toHaveBeenCalled()
  })

  it('should not load user data for docs routes', async () => {
    ;(globalThis as any).__setMockPathname?.('/docs')
    window.history.pushState({}, '', '/docs')

    const { result } = renderHook(() => useAuth())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(apiClient.getMeOrNull).not.toHaveBeenCalled()
  })

  it('should not load user data for share routes', async () => {
    ;(globalThis as any).__setMockPathname?.('/share/abc')
    window.history.pushState({}, '', '/share/abc')

    const { result } = renderHook(() => useAuth())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(apiClient.getMeOrNull).not.toHaveBeenCalled()
  })

  it('should redirect to login when BA session is absent', async () => {
    ;(globalThis as any).__setMockAuthSession?.(null)

    const { result } = renderHook(() => useAuth({ redirectToLogin: true }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const navigate = useI18nNavigate()
    expect(navigate).toHaveBeenCalledWith('/login')
    expect(apiClient.getMeOrNull).not.toHaveBeenCalled()
  })

  it('should redirect to login when session exists but profile is null', async () => {
    ;(apiClient.getMeOrNull as any).mockResolvedValue(null)

    const { result } = renderHook(() => useAuth({ redirectToLogin: true }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const navigate = useI18nNavigate()
    expect(navigate).toHaveBeenCalledWith('/login')
  })

  it('should not redirect when redirectToLogin is false', async () => {
    ;(globalThis as any).__setMockAuthSession?.(null)

    const { result } = renderHook(() => useAuth({ redirectToLogin: false }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const navigate = useI18nNavigate()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('should call onAuthError callback on error', async () => {
    ;(globalThis as any).__setMockAuthSession?.(null)
    const onAuthError = vi.fn()

    const { result } = renderHook(() => useAuth({ onAuthError }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(onAuthError).toHaveBeenCalled()
  })

  it('should refetch user data', async () => {
    const mockUser = { id: 1, username: 'testuser' }
    ;(apiClient.getMeOrNull as any).mockResolvedValue(mockUser)

    const { result } = renderHook(() => useAuth())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    ;(apiClient.getMeOrNull as any).mockResolvedValue({ ...mockUser, username: 'updated' })

    await result.current.refetch()

    await waitFor(() => {
      expect(result.current.user?.username).toBe('updated')
    })
  })
})
