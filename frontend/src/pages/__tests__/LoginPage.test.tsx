import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LoginPage from '../LoginPage'
import { apiClient } from '@/lib/api'
import { useI18nNavigate } from '@/lib/i18n'

let mockNavigate: ReturnType<typeof vi.fn>

vi.mock('@/lib/api', () => ({
  apiClient: {
    getMe: vi.fn(() => Promise.resolve({ id: '1', username: 'testuser', email: 'test@example.com' })),
    login: vi.fn(),
  },
}))

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate = useI18nNavigate() as ReturnType<typeof vi.fn>
  })

  it('should render login form', () => {
    render(<LoginPage />)

    expect(screen.getByText('auth.login.title')).toBeInTheDocument()
    expect(screen.getByText('auth.login.submit')).toBeInTheDocument()
  })

  it('should render username and password fields', () => {
    render(<LoginPage />)

    expect(screen.getByPlaceholderText('auth.fields.username.placeholder')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('auth.fields.password.placeholder')).toBeInTheDocument()
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
    ; (apiClient.login as ReturnType<typeof vi.fn>).mockResolvedValue({})

    render(<LoginPage />)

    const usernameInput = screen.getByPlaceholderText('auth.fields.username.placeholder')
    fireEvent.change(usernameInput, { target: { value: 'test' } })

    const passwordInput = screen.getByPlaceholderText('auth.fields.password.placeholder')
    fireEvent.change(passwordInput, { target: { value: 'test123' } })

    const submitButton = screen.getByText('auth.login.submit')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(apiClient.login).toHaveBeenCalledWith({ username: 'test', password: 'test123' })
    })
  })

  it('should navigate to home on successful login', async () => {
    ; (apiClient.login as ReturnType<typeof vi.fn>).mockResolvedValue({})

    render(<LoginPage />)

    const usernameInput = screen.getByPlaceholderText('auth.fields.username.placeholder')
    fireEvent.change(usernameInput, { target: { value: 'test' } })

    const passwordInput = screen.getByPlaceholderText('auth.fields.password.placeholder')
    fireEvent.change(passwordInput, { target: { value: 'test123' } })

    const submitButton = screen.getByText('auth.login.submit')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })
  })

  it('should have centered layout', () => {
    render(<LoginPage />)

    const container = screen.getByText('auth.login.title').closest('main')
    expect(container).toBeInTheDocument()
    expect(container).toHaveClass('flex', 'flex-1', 'items-center', 'justify-center', 'px-4')
  })
})
