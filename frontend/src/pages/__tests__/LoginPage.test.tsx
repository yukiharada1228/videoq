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

  afterEach(() => {
    globalThis.__setMockLanguage('en')
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

  it('should not render an inert stay signed in checkbox', () => {
    render(<LoginPage />)

    expect(screen.queryByText('auth.login.rememberMe')).not.toBeInTheDocument()
  })

  it('should render signup link', () => {
    render(<LoginPage />)

    expect(screen.getByText('auth.login.footerLink')).toBeInTheDocument()
  })

  it('should call apiClient.login on submit', async () => {
    ;(apiClient.login as ReturnType<typeof vi.fn>).mockResolvedValue({})

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
    ;(apiClient.login as ReturnType<typeof vi.fn>).mockResolvedValue({})

    render(<LoginPage />)

    const usernameInput = screen.getByPlaceholderText('auth.fields.username.placeholder')
    fireEvent.change(usernameInput, { target: { value: 'test' } })

    const passwordInput = screen.getByPlaceholderText('auth.fields.password.placeholder')
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

    const container = screen.getByText('auth.login.title').closest('main')
    expect(container).toBeInTheDocument()
    expect(container).toHaveClass('flex', 'min-h-screen', 'flex-col')
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
      fireEvent.change(screen.getByPlaceholderText('auth.fields.username.placeholder'), { target: { value: 'u' } })
      fireEvent.change(screen.getByPlaceholderText('auth.fields.password.placeholder'), { target: { value: 'p' } })
      fireEvent.click(screen.getByText('auth.login.submit'))
    }

    it('redirects to the safe next path via full navigation', async () => {
      globalThis.__setMockSearchParams('?next=%2Fapi%2Foauth%2Fauthorize%2F%3Fclient_id%3Dabc')

      await submitLoginForm()

      await waitFor(() => {
        expect(hrefSetter).toHaveBeenCalledWith('/api/oauth/authorize/?client_id=abc')
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
