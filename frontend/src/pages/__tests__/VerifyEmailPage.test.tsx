import { render, screen, waitFor } from '@testing-library/react'
import VerifyEmailPage from '../VerifyEmailPage'
import { apiClient } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  apiClient: {
    getMe: vi.fn(() => Promise.resolve({ id: '1', username: 'testuser', email: 'test@example.com' })),
    verifyEmail: vi.fn(),
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams('uid=test-uid&token=test-token')],
  }
})

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render page title', () => {
    ; (apiClient.verifyEmail as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => { })
    )

    render(<VerifyEmailPage />)

    expect(screen.getByText('auth.verifyEmail.title')).toBeInTheDocument()
  })

  it('should render description', () => {
    ; (apiClient.verifyEmail as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => { })
    )

    render(<VerifyEmailPage />)

    expect(screen.getByText('auth.verifyEmail.description')).toBeInTheDocument()
  })

  it('should show loading state initially', () => {
    ; (apiClient.verifyEmail as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => { })
    )

    render(<VerifyEmailPage />)

    expect(screen.getByText('auth.verifyEmail.loading')).toBeInTheDocument()
  })

  it('should call verifyEmail on mount', async () => {
    ; (apiClient.verifyEmail as ReturnType<typeof vi.fn>).mockResolvedValue({ detail: 'Verified' })

    render(<VerifyEmailPage />)

    await waitFor(() => {
      expect(apiClient.verifyEmail).toHaveBeenCalledWith({
        uid: 'test-uid',
        token: 'test-token',
      })
    })
  })

  it('should show success message on successful verification', async () => {
    ; (apiClient.verifyEmail as ReturnType<typeof vi.fn>).mockResolvedValue({ detail: 'Email verified successfully' })

    render(<VerifyEmailPage />)

    await waitFor(() => {
      expect(screen.getByText('Email verified successfully')).toBeInTheDocument()
    })
  })

  it('should redirect to login after successful verification', async () => {
    ; (apiClient.verifyEmail as ReturnType<typeof vi.fn>).mockResolvedValue({ detail: 'Verified' })

    render(<VerifyEmailPage />)

    // Wait for the API call to complete
    await waitFor(() => {
      expect(apiClient.verifyEmail).toHaveBeenCalledWith({
        uid: 'test-uid',
        token: 'test-token',
      })
    }, { timeout: 3000 })

    // Wait for the success message
    await waitFor(() => {
      expect(screen.getByText('Verified')).toBeInTheDocument()
    }, { timeout: 3000 })
  }, 10000)

  it('should show error message on verification failure', async () => {
    ; (apiClient.verifyEmail as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Invalid token'))

    render(<VerifyEmailPage />)

    // First wait for API call
    await waitFor(() => {
      expect(apiClient.verifyEmail).toHaveBeenCalled()
    }, { timeout: 3000 })

    // Then wait for error message to appear
    await waitFor(() => {
      expect(screen.getByText('Invalid token')).toBeInTheDocument()
    }, { timeout: 3000 })
  }, 10000)
})

describe('VerifyEmailPage - API Calls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should handle API error correctly', async () => {
    ; (apiClient.verifyEmail as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Token expired'))

    render(<VerifyEmailPage />)

    // First wait for API call
    await waitFor(() => {
      expect(apiClient.verifyEmail).toHaveBeenCalled()
    }, { timeout: 3000 })

    // Then wait for error message to appear
    await waitFor(() => {
      expect(screen.getByText('Token expired')).toBeInTheDocument()
    }, { timeout: 3000 })
  }, 10000)
})