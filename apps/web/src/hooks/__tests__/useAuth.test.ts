import { renderHook, waitFor } from '@testing-library/react'
import { useAuth } from '../useAuth'
import { useI18nNavigate } from '@/lib/i18n'
import * as authSession from '@/lib/authSession'

const getAccount = vi.fn()

describe('useAuth', () => {
  afterEach(() => vi.restoreAllMocks())
  beforeEach(() => {
    vi.clearAllMocks()
    getAccount.mockReset()
    globalThis.__setTrpcHandler('account.me', getAccount)
    ;(globalThis as any).__setMockPathname?.('/videos')
    ;(globalThis as any).__setMockAuthSession?.({
      user: { id: '1', name: 'testuser', email: 'test@example.com' },
    })
    window.history.pushState({}, '', '/videos')
  })

  it('should initialize with loading state', () => {
    getAccount.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useAuth())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.user).toBeNull()
  })

  it('should load user data on mount for protected routes', async () => {
    const mockUser = { id: 1, username: 'testuser' }
    getAccount.mockResolvedValue(mockUser)

    const { result } = renderHook(() => useAuth())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.user).toEqual(mockUser)
    expect(getAccount).toHaveBeenCalled()
  })

  it('should not redirect from the marketing homepage when logged out', async () => {
    ;(globalThis as any).__setMockPathname?.('/')
    ;(globalThis as any).__setMockAuthSession?.(null)
    window.history.pushState({}, '', '/')

    const { result } = renderHook(() => useAuth({ redirectToLogin: true }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(useI18nNavigate()).not.toHaveBeenCalled()
    expect(getAccount).not.toHaveBeenCalled()
  })

  it('should not load user data for public routes', async () => {
    ;(globalThis as any).__setMockPathname?.('/login')
    window.history.pushState({}, '', '/login')

    const { result } = renderHook(() => useAuth())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(getAccount).not.toHaveBeenCalled()
  })

  it('should not load user data for legal routes', async () => {
    ;(globalThis as any).__setMockPathname?.('/terms')
    window.history.pushState({}, '', '/terms')

    const { result } = renderHook(() => useAuth())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(getAccount).not.toHaveBeenCalled()
  })

  it('should not load user data for pricing', async () => {
    ;(globalThis as any).__setMockPathname?.('/pricing')
    window.history.pushState({}, '', '/pricing')

    const { result } = renderHook(() => useAuth())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(getAccount).not.toHaveBeenCalled()
  })

  it('should not load user data for share routes', async () => {
    ;(globalThis as any).__setMockPathname?.('/share/abc')
    window.history.pushState({}, '', '/share/abc')

    const { result } = renderHook(() => useAuth())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(getAccount).not.toHaveBeenCalled()
  })

  it('should redirect to login when BA session is absent', async () => {
    ;(globalThis as any).__setMockAuthSession?.(null)

    const { result } = renderHook(() => useAuth({ redirectToLogin: true }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const navigate = useI18nNavigate()
    expect(navigate).toHaveBeenCalledWith('/login')
    expect(getAccount).not.toHaveBeenCalled()
  })

  it('should redirect to login when session exists but profile is null', async () => {
    getAccount.mockResolvedValue(null)

    const { result } = renderHook(() => useAuth({ redirectToLogin: true }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const navigate = useI18nNavigate()
    expect(navigate).toHaveBeenCalledWith('/login')
  })

  it('should not treat a transient profile failure as an expired session', async () => {
    const failure = new Error('temporary database failure')
    const onAuthError = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    getAccount.mockRejectedValue(failure)

    const { result } = renderHook(() => useAuth({
      redirectToLogin: true,
      onAuthError,
    }))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(useI18nNavigate()).not.toHaveBeenCalled()
    expect(onAuthError).not.toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalledWith(
      'Authentication check failed:',
      expect.objectContaining({ message: failure.message }),
    )
    consoleError.mockRestore()
  })

  it('keeps the current route when the Better Auth session endpoint is unavailable', async () => {
    const state = authSession.useAuthSession()
    const session = vi.spyOn(authSession, 'useAuthSession').mockReturnValue({
      ...state, data: null, isPending: false,
      error: { status: 503, statusText: 'Service Unavailable', message: 'Temporary failure' },
    })
    const onAuthError = vi.fn()
    const { result, rerender } = renderHook(() => useAuth({ onAuthError }))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(useI18nNavigate()).not.toHaveBeenCalled()
    expect(onAuthError).not.toHaveBeenCalled()
    expect(getAccount).not.toHaveBeenCalled()

    // A later successful anonymous response is authoritative again.
    session.mockReturnValue({ ...state, data: null, isPending: false, error: null })
    rerender()
    await waitFor(() => expect(useI18nNavigate()).toHaveBeenCalledWith('/login'))
    expect(onAuthError).toHaveBeenCalledTimes(1)
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
    getAccount.mockResolvedValue(mockUser)

    const { result } = renderHook(() => useAuth())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    getAccount.mockResolvedValue({ ...mockUser, username: 'updated' })

    await result.current.refetch()

    await waitFor(() => {
      expect(result.current.user?.username).toBe('updated')
    })
  })
})
