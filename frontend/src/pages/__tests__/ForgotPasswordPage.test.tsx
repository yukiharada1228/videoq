import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ForgotPasswordPage from '../ForgotPasswordPage'
import { apiClient } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  apiClient: {
    getMe: vi.fn(() => Promise.resolve({ id: '1', username: 'testuser', email: 'test@example.com' })),
    requestPasswordReset: vi.fn(),
  },
}))

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render page title', () => {
    render(<ForgotPasswordPage />)

    expect(screen.getByText('auth.forgotPassword.title')).toBeInTheDocument()
  })

  it('should render description', () => {
    render(<ForgotPasswordPage />)

    expect(screen.getByText('auth.forgotPassword.description')).toBeInTheDocument()
  })

  it('should render email input', () => {
    render(<ForgotPasswordPage />)

    expect(screen.getByText('auth.fields.email.label')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('auth.fields.email.placeholder')).toBeInTheDocument()
  })

  it('should render submit button', () => {
    render(<ForgotPasswordPage />)

    expect(screen.getByText('auth.forgotPassword.submit')).toBeInTheDocument()
  })

  it('should render back to login link', () => {
    render(<ForgotPasswordPage />)

    expect(screen.getByText('auth.forgotPassword.backToLogin')).toBeInTheDocument()
  })

  it('should call requestPasswordReset on submit', async () => {
    ; (apiClient.requestPasswordReset as ReturnType<typeof vi.fn>).mockResolvedValue({})

    render(<ForgotPasswordPage />)

    const emailInput = screen.getByPlaceholderText('auth.fields.email.placeholder')
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })

    const submitButton = screen.getByText('auth.forgotPassword.submit')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(apiClient.requestPasswordReset).toHaveBeenCalledWith({ email: 'test@example.com' })
    })
  })

  it('should show success message after successful submission', async () => {
    ; (apiClient.requestPasswordReset as ReturnType<typeof vi.fn>).mockResolvedValue({})

    render(<ForgotPasswordPage />)

    const emailInput = screen.getByPlaceholderText('auth.fields.email.placeholder')
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })

    const submitButton = screen.getByText('auth.forgotPassword.submit')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('auth.forgotPassword.success')).toBeInTheDocument()
    })
  })

  it('should show loading state while submitting', async () => {
    ; (apiClient.requestPasswordReset as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    )

    render(<ForgotPasswordPage />)

    const emailInput = screen.getByPlaceholderText('auth.fields.email.placeholder')
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })

    const submitButton = screen.getByText('auth.forgotPassword.submit')
    fireEvent.click(submitButton)

    expect(screen.getByText('auth.forgotPassword.submitting')).toBeInTheDocument()
  })
})
