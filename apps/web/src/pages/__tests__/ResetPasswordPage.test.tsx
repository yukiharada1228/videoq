import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import ResetPasswordPage from '../ResetPasswordPage'
import { apiClient } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  apiClient: {
    getMe: vi.fn(() => Promise.resolve({ id: '1', username: 'testuser', email: 'test@example.com' })),
    confirmPasswordReset: vi.fn(),
  },
}))

beforeEach(() => globalThis.__setMockSearchParams('token=test-token'))

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.__setMockLanguage('en')
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

    const passwordInput = screen.getByLabelText(/auth\.resetPassword\.newPassword/)
    const confirmInput = screen.getByLabelText(/auth\.resetPassword\.confirmPassword/)

    fireEvent.change(passwordInput, { target: { value: 'newpassword123' } })
    fireEvent.change(confirmInput, { target: { value: 'newpassword123' } })

    const submitButton = screen.getByText('auth.resetPassword.submit')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(apiClient.confirmPasswordReset).toHaveBeenCalledWith({
        token: 'test-token',
        new_password: 'newpassword123',
      })
    })
  })

  it('should show success message after successful reset', async () => {
    ;(apiClient.confirmPasswordReset as ReturnType<typeof vi.fn>).mockResolvedValue({})

    render(<ResetPasswordPage />)

    const passwordInput = screen.getByLabelText(/auth\.resetPassword\.newPassword/)
    const confirmInput = screen.getByLabelText(/auth\.resetPassword\.confirmPassword/)

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

    const passwordInput = screen.getByLabelText(/auth\.resetPassword\.newPassword/)
    const confirmInput = screen.getByLabelText(/auth\.resetPassword\.confirmPassword/)

    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.change(confirmInput, { target: { value: 'different456' } })

    const submitButton = screen.getByText('auth.resetPassword.submit')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText('auth.resetPassword.passwordMismatch')).toBeInTheDocument()
    })

    expect(apiClient.confirmPasswordReset).not.toHaveBeenCalled()
  })

  it('shows the API error on the first attempt and permits a successful retry', async () => {
    vi.mocked(apiClient.confirmPasswordReset)
      .mockRejectedValueOnce(new Error('Reset service unavailable'))
      .mockResolvedValue(undefined)
    render(<ResetPasswordPage />)
    fireEvent.change(screen.getByLabelText(/auth\.resetPassword\.newPassword/), { target: { value: 'newpassword123' } })
    fireEvent.change(screen.getByLabelText(/auth\.resetPassword\.confirmPassword/), { target: { value: 'newpassword123' } })
    fireEvent.click(screen.getByRole('button', { name: 'auth.resetPassword.submit' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Reset service unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'auth.resetPassword.submit' }))
    expect(await screen.findByText('auth.resetPassword.success')).toBeInTheDocument()
    expect(screen.queryByText('Reset service unavailable')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'auth.resetPassword.submit' })).not.toBeInTheDocument()
    expect(apiClient.confirmPasswordReset).toHaveBeenCalledTimes(2)
  })

  it('uses autofilled passwords and prevents duplicate reset requests', async () => {
    let finish!: () => void
    vi.mocked(apiClient.confirmPasswordReset).mockImplementation(() => new Promise(resolve => { finish = resolve }))
    render(<ResetPasswordPage />)
    const password = screen.getByLabelText<HTMLInputElement>(/auth\.resetPassword\.newPassword/)
    const confirm = screen.getByLabelText<HTMLInputElement>(/auth\.resetPassword\.confirmPassword/)
    password.value = confirm.value = 'autofilled-password'
    act(() => { fireEvent.submit(password.closest('form')!); fireEvent.submit(password.closest('form')!) })
    await waitFor(() => expect(apiClient.confirmPasswordReset).toHaveBeenCalled())
    await act(async () => { finish() })
    expect(apiClient.confirmPasswordReset).toHaveBeenCalledExactlyOnceWith({ token: 'test-token', new_password: 'autofilled-password' })
    expect(await screen.findByText('auth.resetPassword.success')).toBeInTheDocument()
    expect(screen.queryByLabelText(/auth\.resetPassword\.newPassword/)).not.toBeInTheDocument()
  })

  it('reports an invalid link immediately without offering a reset form', () => {
    globalThis.__setMockSearchParams('error=INVALID_TOKEN')
    render(<ResetPasswordPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('auth.resetPassword.invalidLink')
    expect(screen.queryByRole('button', { name: 'auth.resetPassword.submit' })).not.toBeInTheDocument()
    expect(apiClient.confirmPasswordReset).not.toHaveBeenCalled()
  })

  it('clears the previous reset state when the token changes', async () => {
    vi.mocked(apiClient.confirmPasswordReset).mockResolvedValue(undefined)
    const { rerender } = render(<ResetPasswordPage />)
    fireEvent.change(screen.getByLabelText(/auth\.resetPassword\.newPassword/), { target: { value: 'newpassword123' } })
    fireEvent.change(screen.getByLabelText(/auth\.resetPassword\.confirmPassword/), { target: { value: 'newpassword123' } })
    fireEvent.click(screen.getByRole('button', { name: 'auth.resetPassword.submit' }))
    expect(await screen.findByText('auth.resetPassword.success')).toBeInTheDocument()
    globalThis.__setMockSearchParams('token=new-token')
    rerender(<ResetPasswordPage />)
    expect(screen.queryByText('auth.resetPassword.success')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/auth\.resetPassword\.newPassword/)).toHaveValue('')
    expect(screen.getByRole('button', { name: 'auth.resetPassword.submit' })).toBeEnabled()
  })

  it('ignores the old reset response after switching to a different token', async () => {
    let finish!: () => void
    vi.mocked(apiClient.confirmPasswordReset).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const { rerender } = render(<ResetPasswordPage />)
    fireEvent.change(screen.getByLabelText(/auth\.resetPassword\.newPassword/), { target: { value: 'newpassword123' } })
    fireEvent.change(screen.getByLabelText(/auth\.resetPassword\.confirmPassword/), { target: { value: 'newpassword123' } })
    fireEvent.click(screen.getByRole('button', { name: 'auth.resetPassword.submit' }))
    await waitFor(() => expect(apiClient.confirmPasswordReset).toHaveBeenCalled())
    globalThis.__setMockSearchParams('token=new-token')
    rerender(<ResetPasswordPage />)
    fireEvent.change(screen.getByLabelText(/auth\.resetPassword\.newPassword/), { target: { value: 'next-password' } })
    await act(async () => { finish() })
    expect(screen.queryByText('auth.resetPassword.success')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/auth\.resetPassword\.newPassword/)).toHaveValue('next-password')
    expect(screen.getByRole('button', { name: 'auth.resetPassword.submit' })).toBeEnabled()
    expect(apiClient.confirmPasswordReset).toHaveBeenCalledExactlyOnceWith({ token: 'test-token', new_password: 'newpassword123' })
  })
})

describe('ResetPasswordPage - Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should not call API when passwords do not match', async () => {
    render(<ResetPasswordPage />)

    const passwordInput = screen.getByLabelText(/auth\.resetPassword\.newPassword/)
    const confirmInput = screen.getByLabelText(/auth\.resetPassword\.confirmPassword/)

    fireEvent.change(passwordInput, { target: { value: 'password1' } })
    fireEvent.change(confirmInput, { target: { value: 'password2' } })

    const submitButton = screen.getByText('auth.resetPassword.submit')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(apiClient.confirmPasswordReset).not.toHaveBeenCalled()
    })
  })
})
