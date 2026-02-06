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
    mockNavigate = useI18nNavigate() as ReturnType<typeof vi.fn>
  })

  it('should render signup form', () => {
    render(<SignupPage />)

    expect(screen.getByText('auth.signup.title')).toBeInTheDocument()
    expect(screen.getByText('auth.signup.submit')).toBeInTheDocument()
  })

  it('should render all required fields', () => {
    render(<SignupPage />)

    expect(screen.getByText('auth.signup.description')).toBeInTheDocument()
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

    const emailInput = screen.getByPlaceholderText('auth.fields.email.placeholder')
    const usernameInput = screen.getByPlaceholderText('auth.fields.username.placeholder')
    const passwordInput = screen.getByPlaceholderText('auth.fields.password.placeholder')
    const confirmPasswordInput = screen.getByPlaceholderText('auth.fields.passwordConfirmation.placeholder')

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

  it('should navigate to check email page on successful signup', async () => {
    ; (apiClient.signup as ReturnType<typeof vi.fn>).mockResolvedValue({})

    render(<SignupPage />)

    const emailInput = screen.getByPlaceholderText('auth.fields.email.placeholder')
    const usernameInput = screen.getByPlaceholderText('auth.fields.username.placeholder')
    const passwordInput = screen.getByPlaceholderText('auth.fields.password.placeholder')
    const confirmPasswordInput = screen.getByPlaceholderText('auth.fields.passwordConfirmation.placeholder')

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

  it('should have centered layout', () => {
    render(<SignupPage />)

    const container = screen.getByText('auth.signup.title').closest('main')
    expect(container).toBeInTheDocument()
    expect(container).toHaveClass('flex', 'flex-1', 'items-center', 'justify-center', 'px-4')
  })

  it('should display footer question text', () => {
    render(<SignupPage />)

    expect(screen.getByText('auth.signup.footerQuestion')).toBeInTheDocument()
  })
})
