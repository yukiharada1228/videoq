import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SignupPage from '../SignupPage'
import { apiClient } from '@/lib/api'
import { useI18nNavigate } from '@/lib/i18n'

let mockNavigate: ReturnType<typeof vi.fn>

vi.mock('@/lib/api', () => ({
  apiClient: {
    signup: vi.fn(),
  },
}))

vi.mock('@/hooks/useAuthForm', () => ({
  useAuthForm: ({ onSubmit, onSuccessRedirect }: { onSubmit: (data: unknown) => Promise<void>, onSuccessRedirect: () => void }) => ({
    formData: { username: '', email: '', password: '', confirmPassword: '' },
    error: null,
    loading: false,
    handleChange: vi.fn(),
    handleSubmit: async (e: Event) => {
      e.preventDefault()
      await onSubmit({ username: 'test', email: 'test@example.com', password: 'test123', confirmPassword: 'test123' })
      onSuccessRedirect()
    },
  }),
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
  })

  it('should render login link', () => {
    render(<SignupPage />)

    expect(screen.getByText('auth.signup.footerLink')).toBeInTheDocument()
  })

  it('should call apiClient.signup on submit', async () => {
    const mockSignup = vi.fn().mockResolvedValue({})
    ;(apiClient.signup as ReturnType<typeof vi.fn>).mockImplementation(mockSignup)

    render(<SignupPage />)

    const submitButton = screen.getByText('auth.signup.submit')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockSignup).toHaveBeenCalled()
    })
  })

  it('should navigate to check email page on successful signup', async () => {
    ;(apiClient.signup as ReturnType<typeof vi.fn>).mockResolvedValue({})

    render(<SignupPage />)

    const submitButton = screen.getByText('auth.signup.submit')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/signup/check-email')
    })
  })

  it('should have centered layout', () => {
    render(<SignupPage />)

    const container = screen.getByText('auth.signup.title').closest('div')
    expect(container).toBeInTheDocument()
  })

  it('should display footer question text', () => {
    render(<SignupPage />)

    expect(screen.getByText('auth.signup.footerQuestion')).toBeInTheDocument()
  })
})
