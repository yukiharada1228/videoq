import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SignupPage from '../SignupPage'
import { apiClient } from '@/lib/api'
import { useI18nNavigate } from '@/lib/i18n'

let mockNavigate: ReturnType<typeof vi.fn>

vi.mock('@/lib/api', () => ({
  apiClient: {
    getMe: vi.fn(() => Promise.resolve({ id: '1', username: 'testuser', email: 'test@example.com' })),
    signup: vi.fn(),
  },
}))

describe('SignupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.__setMockSearchParams('')
    mockNavigate = useI18nNavigate() as ReturnType<typeof vi.fn>
  })

  it('should render signup form', () => {
    render(<SignupPage />)

    expect(screen.getByText('auth.signup.title')).toBeInTheDocument()
    expect(screen.getByText('auth.signup.submit')).toBeInTheDocument()
  })

  it('should render all required fields', () => {
    render(<SignupPage />)

    expect(screen.getByText('auth.fields.email.label')).toBeInTheDocument()
    expect(screen.getByText('auth.fields.username.label')).toBeInTheDocument()
    expect(screen.getByText('auth.fields.password.label')).toBeInTheDocument()
    expect(screen.getByText('auth.fields.passwordConfirmation.label')).toBeInTheDocument()
  })

  it('should render login link', () => {
    render(<SignupPage />)

    expect(screen.getByText('auth.signup.footerLink')).toBeInTheDocument()
  })

  it('should call apiClient.signup on submit', async () => {
    const mockSignup = vi.fn().mockResolvedValue({})
      ; (apiClient.signup as ReturnType<typeof vi.fn>).mockImplementation(mockSignup)

    render(<SignupPage />)

    const emailInput = screen.getByLabelText(/auth\.fields\.email\.label/)
    const usernameInput = screen.getByLabelText(/auth\.fields\.username\.label/)
    const passwordInput = screen.getByLabelText(/auth\.fields\.password\.label/)
    const confirmPasswordInput = screen.getByLabelText(/auth\.fields\.passwordConfirmation\.label/)

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(usernameInput, { target: { value: 'testuser' } })
    fireEvent.change(passwordInput, { target: { value: 'test1234' } })
    fireEvent.change(confirmPasswordInput, { target: { value: 'test1234' } })

    const submitButton = screen.getByText('auth.signup.submit')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockSignup).toHaveBeenCalledWith({
        email: 'test@example.com',
        username: 'testuser',
        password: 'test1234',
      })
    })
  })

  it('preserves a safe invitation return path through email verification', async () => {
    globalThis.__setMockSearchParams('next=%2Fgroup-invitations%2Finvite-token')
    ; (apiClient.signup as ReturnType<typeof vi.fn>).mockResolvedValue({})

    render(<SignupPage />)

    fireEvent.change(screen.getByLabelText(/auth\.fields\.email\.label/), { target: { value: 'student@example.com' } })
    fireEvent.change(screen.getByLabelText(/auth\.fields\.username\.label/), { target: { value: 'student' } })
    fireEvent.change(screen.getByLabelText(/auth\.fields\.password\.label/), { target: { value: 'test12345678' } })
    fireEvent.change(screen.getByLabelText(/auth\.fields\.passwordConfirmation\.label/), { target: { value: 'test12345678' } })
    fireEvent.click(screen.getByText('auth.signup.submit'))

    await waitFor(() => {
      expect(apiClient.signup).toHaveBeenCalledWith({
        email: 'student@example.com',
        username: 'student',
        password: 'test12345678',
        callbackURL: '/group-invitations/invite-token',
      })
    })
  })

  it('should navigate to check email page on successful signup', async () => {
    ; (apiClient.signup as ReturnType<typeof vi.fn>).mockResolvedValue({})

    render(<SignupPage />)

    const emailInput = screen.getByLabelText(/auth\.fields\.email\.label/)
    const usernameInput = screen.getByLabelText(/auth\.fields\.username\.label/)
    const passwordInput = screen.getByLabelText(/auth\.fields\.password\.label/)
    const confirmPasswordInput = screen.getByLabelText(/auth\.fields\.passwordConfirmation\.label/)

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.change(usernameInput, { target: { value: 'testuser' } })
    fireEvent.change(passwordInput, { target: { value: 'test1234' } })
    fireEvent.change(confirmPasswordInput, { target: { value: 'test1234' } })

    const submitButton = screen.getByText('auth.signup.submit')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/signup/check-email')
    })
  })

  it('should have AuthLayout main element', () => {
    render(<SignupPage />)

    const main = screen.getByRole('main')
    expect(main).toBeInTheDocument()
    expect(screen.getByText('auth.signup.title')).toBeInTheDocument()
  })

  it('should display footer question text', () => {
    render(<SignupPage />)

    expect(screen.getByText('auth.signup.footerQuestion')).toBeInTheDocument()
  })
})
