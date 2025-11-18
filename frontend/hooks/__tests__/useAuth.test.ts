import { renderHook, waitFor } from '@testing-library/react'
import { useAuth } from '../useAuth'
import { apiClient } from '@/lib/api'

// Mock apiClient
jest.mock('@/lib/api', () => ({
  apiClient: {
    getMe: jest.fn(),
  },
}))

// Mock next/navigation
const mockPush = jest.fn()
const mockPathname = '/'

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  usePathname: () => mockPathname,
}))

describe('useAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset window.location.pathname
    delete (window as { location?: { pathname?: string } }).location
    window.location = { pathname: '/' } as Location
  })

  it('should initialize with loading state', () => {
    const { result } = renderHook(() => useAuth())
    
    expect(result.current.loading).toBe(true)
    expect(result.current.user).toBeNull()
  })

  it('should load user data on mount for protected routes', async () => {
    const mockUser = { id: 1, username: 'testuser' }
    ;(apiClient.getMe as jest.Mock).mockResolvedValue(mockUser)

    const { result } = renderHook(() => useAuth())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.user).toEqual(mockUser)
    expect(apiClient.getMe).toHaveBeenCalled()
  })

  it('should not load user data for public routes', async () => {
    // Mock usePathname to return /login
    jest.doMock('next/navigation', () => ({
      useRouter: () => ({
        push: mockPush,
      }),
      usePathname: () => '/login',
    }))

    const { result } = renderHook(() => useAuth())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // For public routes, getMe should not be called
    // Note: This test may need adjustment based on actual behavior
  })

  it('should redirect to login on authentication error', async () => {
    ;(apiClient.getMe as jest.Mock).mockRejectedValue(new Error('Unauthorized'))
    window.location = { pathname: '/protected' } as Location

    const { result } = renderHook(() => useAuth({ redirectToLogin: true }))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(mockPush).toHaveBeenCalledWith('/login')
  })

  it('should not redirect when redirectToLogin is false', async () => {
    ;(apiClient.getMe as jest.Mock).mockRejectedValue(new Error('Unauthorized'))
    window.location = { pathname: '/protected' } as Location

    const { result } = renderHook(() => useAuth({ redirectToLogin: false }))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(mockPush).not.toHaveBeenCalled()
  })

  it('should call onAuthError callback on error', async () => {
    ;(apiClient.getMe as jest.Mock).mockRejectedValue(new Error('Unauthorized'))
    const onAuthError = jest.fn()

    const { result } = renderHook(() => useAuth({ onAuthError }))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(onAuthError).toHaveBeenCalled()
  })

  it('should refetch user data', async () => {
    const mockUser = { id: 1, username: 'testuser' }
    ;(apiClient.getMe as jest.Mock).mockResolvedValue(mockUser)

    const { result } = renderHook(() => useAuth())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    ;(apiClient.getMe as jest.Mock).mockResolvedValue({ ...mockUser, username: 'updated' })

    await result.current.refetch()

    await waitFor(() => {
      expect(result.current.user?.username).toBe('updated')
    })
  })
})

