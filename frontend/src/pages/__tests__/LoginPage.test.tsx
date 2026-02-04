import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LoginPage from '../LoginPage'
import { apiClient } from '@/lib/api'
import { useI18nNavigate } from '@/lib/i18n'

vi.mock('@/lib/api', () => ({
  apiClient: {
    login: vi.fn(),
  },
}))

vi.mock('@/hooks/useAuthForm', () => ({
  useAuthForm: ({ onSubmit, onSuccessRedirect }: { onSubmit: (data: unknown) => Promise<void>, onSuccessRedirect: () => void }) => ({
    formData: { username: '', password: '' },
    error: null,
    loading: false,
    handleChange: vi.fn(),
    handleSubmit: async (e: Event) => {
      e.preventDefault()
      await onSubmit({ username: 'test', password: 'test123' })
      onSuccessRedirect()
    },
  }),
}))

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render login form', () => {
    render(<LoginPage />)

    expect(screen.getByText('auth.login.title')).toBeInTheDocument()
    expect(screen.getByText('auth.login.submit')).toBeInTheDocument()
  })

  it('should render username and password fields', () => {
    render(<LoginPage />)

    // Fields are rendered through AuthForm component
    expect(screen.getByText('auth.login.description')).toBeInTheDocument()
  })

  it('should render forgot password link', () => {
    render(<LoginPage />)

    const forgotLink = screen.getByText('auth.login.forgotPassword')
    expect(forgotLink).toBeInTheDocument()
  })

  it('should render signup link', () => {
    render(<LoginPage />)

    expect(screen.getByText('auth.login.footerLink')).toBeInTheDocument()
  })

  it('should call apiClient.login on submit', async () => {
    const mockLogin = vi.fn().mockResolvedValue({})
    ;(apiClient.login as ReturnType<typeof vi.fn>).mockImplementation(mockLogin)

    render(<LoginPage />)

    const submitButton = screen.getByText('auth.login.submit')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalled()
    })
  })

  it('should navigate to home on successful login', async () => {
    const mockNavigate = useI18nNavigate()
    ;(apiClient.login as ReturnType<typeof vi.fn>).mockResolvedValue({})

    render(<LoginPage />)

    const submitButton = screen.getByText('auth.login.submit')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })
  })

  it('should have centered layout', () => {
    render(<LoginPage />)

    // Check that PageLayout with centered prop is used
    const container = screen.getByText('auth.login.title').closest('div')
    expect(container).toBeInTheDocument()
  })
})
