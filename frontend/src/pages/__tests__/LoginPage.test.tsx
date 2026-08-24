import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import LoginPage from '../LoginPage'
import { apiClient } from '@/lib/api'
import { useI18nNavigate } from '@/lib/i18n'

let mockNavigate: ReturnType<typeof vi.fn>

vi.mock('@/lib/auth-client', () => ({
  AUTH_BASE_URL: 'http://localhost:8000',
  authClient: {
    getSession: vi.fn(() => Promise.resolve({ data: { user: { id: '1' } }, error: null })),
  },
}))

vi.mock('@/lib/api', () => ({
  apiClient: {
    getMe: vi.fn(() => Promise.resolve({ id: '1', username: 'testuser', email: 'test@example.com' })),
    getMeOrNull: vi.fn(() => Promise.resolve({ id: '1', username: 'testuser', email: 'test@example.com' })),
    login: vi.fn(),
    loginWithGoogle: vi.fn(() => Promise.resolve()),
  },
}))

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate = useI18nNavigate() as ReturnType<typeof vi.fn>
  })

  afterEach(() => {
    globalThis.__setMockLanguage('en')
    globalThis.__setMockSearchParams('')
  })

  it('should render login form', () => {
    render(<LoginPage />)

    expect(screen.getByText('auth.login.title')).toBeInTheDocument()
    expect(screen.getByText('auth.login.submit')).toBeInTheDocument()
  })

  it('should render username and password fields', () => {
    render(<LoginPage />)

    expect(screen.getByLabelText(/auth\.fields\.username\.label/)).toBeInTheDocument()
    expect(screen.getByLabelText(/auth\.fields\.password\.label/)).toBeInTheDocument()
  })

  it('should render forgot password link', () => {
    render(<LoginPage />)

    const forgotLink = screen.getByText('auth.login.forgotPassword')
    expect(forgotLink).toBeInTheDocument()
  })

  it('should not render an inert stay signed in checkbox', () => {
    render(<LoginPage />)

    expect(screen.queryByText('auth.login.rememberMe')).not.toBeInTheDocument()
  })

  it('should render signup link', () => {
    render(<LoginPage />)

    expect(screen.getByText('auth.login.footerLink')).toBeInTheDocument()
  })

  it('should render Google sign-in and call loginWithGoogle', async () => {
    render(<LoginPage />)

    const googleButton = screen.getByText('auth.login.continueWithGoogle')
    expect(googleButton).toBeInTheDocument()
    fireEvent.click(googleButton)

    await waitFor(() => {
      expect(apiClient.loginWithGoogle).toHaveBeenCalledWith('/')
    })
  })

  it('preserves an invitation return path for Google sign-in and the signup link', async () => {
    globalThis.__setMockSearchParams('next=%2Fcourse-invitations%2Finvite-token')
    render(<LoginPage />)

    fireEvent.click(screen.getByText('auth.login.continueWithGoogle'))

    await waitFor(() => {
      expect(apiClient.loginWithGoogle).toHaveBeenCalledWith('/course-invitations/invite-token')
    })
    expect(screen.getByText('auth.login.footerLink').closest('a')).toHaveAttribute(
      'href',
      '/signup?next=%2Fcourse-invitations%2Finvite-token',
    )
  })

  it('shows an OAuth callback error from the query string', () => {
    globalThis.__setMockSearchParams('?error=unable_to_create_user')
    render(<LoginPage />)
    expect(screen.getByText('auth.login.oauthCallbackFailed')).toBeInTheDocument()
  })

  it('should call apiClient.login on submit', async () => {
    ;(apiClient.login as ReturnType<typeof vi.fn>).mockResolvedValue({})

    render(<LoginPage />)

    const usernameInput = screen.getByLabelText(/auth\.fields\.username\.label/)
    fireEvent.change(usernameInput, { target: { value: 'test' } })

    const passwordInput = screen.getByLabelText(/auth\.fields\.password\.label/)
    fireEvent.change(passwordInput, { target: { value: 'test123' } })

    const submitButton = screen.getByText('auth.login.submit')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(apiClient.login).toHaveBeenCalledWith({ username: 'test', password: 'test123' })
    })
  })

  it('should navigate to home on successful login', async () => {
    ;(apiClient.login as ReturnType<typeof vi.fn>).mockResolvedValue({})

    render(<LoginPage />)

    const usernameInput = screen.getByLabelText(/auth\.fields\.username\.label/)
    fireEvent.change(usernameInput, { target: { value: 'test' } })

    const passwordInput = screen.getByLabelText(/auth\.fields\.password\.label/)
    fireEvent.change(passwordInput, { target: { value: 'test123' } })

    const submitButton = screen.getByText('auth.login.submit')
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(apiClient.getMe).toHaveBeenCalled()
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })
  })

  it('should have AuthLayout main element', () => {
    render(<LoginPage />)

    const main = screen.getByRole('main')
    expect(main).toBeInTheDocument()
    expect(screen.getByText('auth.login.title')).toBeInTheDocument()
  })

  describe('?next= redirect after login', () => {
    let originalLocation: Location
    let hrefSetter: ReturnType<typeof vi.fn>

    beforeEach(() => {
      originalLocation = window.location
      hrefSetter = vi.fn()
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: new Proxy({ href: '' } as { href: string }, {
          set(target, prop, value) {
            if (prop === 'href') {
              hrefSetter(value)
              target.href = value
              return true
            }
            return false
          },
          get(target, prop) {
            return target[prop as keyof typeof target]
          },
        }),
      })
    })

    afterEach(() => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      })
      globalThis.__setMockSearchParams('')
    })

    const submitLoginForm = async () => {
      ;(apiClient.login as ReturnType<typeof vi.fn>).mockResolvedValue({})
      render(<LoginPage />)
      fireEvent.change(screen.getByLabelText(/auth\.fields\.username\.label/), { target: { value: 'u' } })
      fireEvent.change(screen.getByLabelText(/auth\.fields\.password\.label/), { target: { value: 'p' } })
      fireEvent.click(screen.getByText('auth.login.submit'))
    }

    it('resumes the Better Auth authorize query after login', async () => {
      globalThis.__setMockSearchParams(
        '?client_id=abc&redirect_uri=https%3A%2F%2Fchatgpt.com%2Fconnector%2Foauth%2Fcb&response_type=code',
      )

      await submitLoginForm()

      await waitFor(() => {
        expect(hrefSetter).toHaveBeenCalledWith(
          '/api/auth/oauth2/authorize?client_id=abc&redirect_uri=https%3A%2F%2Fchatgpt.com%2Fconnector%2Foauth%2Fcb&response_type=code',
        )
      })
      expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('redirects to the safe next path via full navigation', async () => {
      globalThis.__setMockSearchParams('?next=%2Fapi%2Foauth%2Fauthorize%3Fclient_id%3Dabc')

      await submitLoginForm()

      await waitFor(() => {
        expect(hrefSetter).toHaveBeenCalledWith('/api/oauth/authorize?client_id=abc')
      })
      expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('ignores a protocol-relative next and falls back to home', async () => {
      globalThis.__setMockSearchParams('?next=%2F%2Fevil.com%2Fphish')

      await submitLoginForm()

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/')
      })
      expect(hrefSetter).not.toHaveBeenCalled()
    })

    it('ignores an absolute URL next and falls back to home', async () => {
      globalThis.__setMockSearchParams('?next=https%3A%2F%2Fevil.com')

      await submitLoginForm()

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/')
      })
      expect(hrefSetter).not.toHaveBeenCalled()
    })
  })

})
