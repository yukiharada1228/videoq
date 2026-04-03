import { render, screen } from '@testing-library/react'
import SignupCheckEmailPage from '../SignupCheckEmailPage'

describe('SignupCheckEmailPage', () => {
  afterEach(() => {
    globalThis.__setMockLanguage('en')
  })

  it('should render page title', () => {
    render(<SignupCheckEmailPage />)

    expect(screen.getByText('auth.checkEmail.title')).toBeInTheDocument()
  })

  it('should render description', () => {
    render(<SignupCheckEmailPage />)

    expect(screen.getByText('auth.checkEmail.description')).toBeInTheDocument()
  })

  it('should render success alert', () => {
    render(<SignupCheckEmailPage />)

    expect(screen.getByText('auth.checkEmail.alert')).toBeInTheDocument()
  })

  it('should render help text', () => {
    render(<SignupCheckEmailPage />)

    expect(screen.getByText('auth.checkEmail.help')).toBeInTheDocument()
  })

  it('should render back to login link', () => {
    render(<SignupCheckEmailPage />)

    expect(screen.getByText('auth.checkEmail.backToLogin')).toBeInTheDocument()
  })

  it('should have centered layout', () => {
    render(<SignupCheckEmailPage />)

    const container = screen.getByText('auth.checkEmail.title').closest('div')
    expect(container).toBeInTheDocument()
  })

  it('sets english metadata', () => {
    globalThis.__setMockLanguage('en')
    render(<SignupCheckEmailPage />)

    expect(document.title).toBe('Check Your Email | VideoQ')
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'Check your inbox to verify your email address and finish creating your VideoQ account.'
    )
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://videoq.jp/signup/check-email'
    )
  })

  it('switches metadata for japanese locale', () => {
    globalThis.__setMockLanguage('ja')
    render(<SignupCheckEmailPage />)

    expect(document.title).toBe('メールをご確認ください | VideoQ')
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      '受信メールを確認して、メールアドレス認証を完了し、VideoQ アカウント登録を完了してください。'
    )
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://videoq.jp/ja/signup/check-email'
    )
  })
})
