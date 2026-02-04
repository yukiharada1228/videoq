import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ResetPasswordPage from '../ResetPasswordPage'
import { apiClient } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  apiClient: {
    confirmPasswordReset: vi.fn(),
  },
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams('uid=test-uid&token=test-token')],
  }
})

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render page title', () => {
    render(<ResetPasswordPage />)

    expect(screen.getByText('auth.resetPassword.title')).toBeInTheDocument()
  })

  it('should render description', () => {
    render(<ResetPasswordPage />)

    expect(screen.getByText('auth.resetPassword.description')).toBeInTheDocument()
  })

  it('should render password input', () => {
    render(<ResetPasswordPage />)

    expect(screen.getByText('auth.resetPassword.newPassword')).toBeInTheDocument()
  })

  it('should render confirm password input', () => {
    render(<ResetPasswordPage />)

    expect(screen.getByText('auth.resetPassword.confirmPassword')).toBeInTheDocument()
  })

  it('should render submit button', () => {
    render(<ResetPasswordPage />)

    expect(screen.getByText('auth.resetPassword.submit')).toBeInTheDocument()
  })

  it('should render back to login link', () => {
    render(<ResetPasswordPage />)

    expect(screen.getByText('auth.resetPassword.backToLogin')).toBeInTheDocument()
  })

  it('should call confirmPasswordReset on submit', async () => {
    ;(apiClient.confirmPasswordReset as ReturnType<typeof vi.fn>).mockResolvedValue({})

    render(<ResetPasswordPage />)

    const passwordInput = screen.getByPlaceholderText('auth.resetPassword.newPasswordPlaceholder')
    const confirmInput = screen.getByPlaceholderText('auth.resetPassword.confirmPasswordPlaceholder')

    fireEvent.change(passwordInput, { target: { value: 'newpassword123' } })
    fireEvent.change(confirmInput, { target: { value: 'newpassword123' } })

    const submitButton = screen.getByText('auth.resetPassword.submit')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(apiClient.confirmPasswordReset).toHaveBeenCalledWith({
        uid: 'test-uid',
        token: 'test-token',
        new_password: 'newpassword123',
      })
    })
  })

  it('should show success message after successful reset', async () => {
    ;(apiClient.confirmPasswordReset as ReturnType<typeof vi.fn>).mockResolvedValue({})

    render(<ResetPasswordPage />)

    const passwordInput = screen.getByPlaceholderText('auth.resetPassword.newPasswordPlaceholder')
    const confirmInput = screen.getByPlaceholderText('auth.resetPassword.confirmPasswordPlaceholder')

    fireEvent.change(passwordInput, { target: { value: 'newpassword123' } })
    fireEvent.change(confirmInput, { target: { value: 'newpassword123' } })

    const submitButton = screen.getByText('auth.resetPassword.submit')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('auth.resetPassword.success')).toBeInTheDocument()
    })
  })

  it('should show error when passwords do not match', async () => {
    render(<ResetPasswordPage />)

    const passwordInput = screen.getByPlaceholderText('auth.resetPassword.newPasswordPlaceholder')
    const confirmInput = screen.getByPlaceholderText('auth.resetPassword.confirmPasswordPlaceholder')

    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.change(confirmInput, { target: { value: 'different456' } })

    const submitButton = screen.getByText('auth.resetPassword.submit')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('auth.resetPassword.passwordMismatch')).toBeInTheDocument()
    })

    expect(apiClient.confirmPasswordReset).not.toHaveBeenCalled()
  })
})

describe('ResetPasswordPage - Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should not call API when passwords do not match', async () => {
    render(<ResetPasswordPage />)

    const passwordInput = screen.getByPlaceholderText('auth.resetPassword.newPasswordPlaceholder')
    const confirmInput = screen.getByPlaceholderText('auth.resetPassword.confirmPasswordPlaceholder')

    fireEvent.change(passwordInput, { target: { value: 'password1' } })
    fireEvent.change(confirmInput, { target: { value: 'password2' } })

    const submitButton = screen.getByText('auth.resetPassword.submit')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(apiClient.confirmPasswordReset).not.toHaveBeenCalled()
    })
  })
})
