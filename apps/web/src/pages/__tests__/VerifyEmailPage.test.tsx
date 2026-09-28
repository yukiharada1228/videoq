import { act, render, screen } from '@testing-library/react'
import VerifyEmailPage from '../VerifyEmailPage'
import { apiClient } from '@/lib/api'
import { useI18nNavigate } from '@/lib/i18n'

vi.mock('@/lib/api', () => ({ apiClient: { verifyEmail: vi.fn() } }))

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiClient.verifyEmail).mockReset().mockResolvedValue(undefined)
    globalThis.__setMockSearchParams('token=test-token')
  })
  afterEach(() => vi.useRealTimers())

  it('shows its title, description and loading message while verification is pending', () => {
    vi.mocked(apiClient.verifyEmail).mockReturnValue(new Promise(() => {}))
    render(<VerifyEmailPage />)
    expect(screen.getByText('auth.verifyEmail.title')).toBeInTheDocument()
    expect(screen.getByText('auth.verifyEmail.description')).toBeInTheDocument()
    expect(screen.getByText('auth.verifyEmail.loading')).toBeInTheDocument()
    expect(useI18nNavigate()).not.toHaveBeenCalled()
  })

  it('displays the translated success message after verifying the token', async () => {
    render(<VerifyEmailPage />)
    expect(await screen.findByText('auth.verifyEmail.success')).toBeInTheDocument()
    expect(apiClient.verifyEmail).toHaveBeenCalledExactlyOnceWith({ token: 'test-token' })
  })

  it('redirects to login after showing the successful verification', async () => {
    vi.useFakeTimers()
    render(<VerifyEmailPage />)
    await act(async () => { await vi.advanceTimersByTimeAsync(100) })
    expect(screen.getByText('auth.verifyEmail.success')).toBeInTheDocument()
    expect(useI18nNavigate()).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(useI18nNavigate()).toHaveBeenCalledExactlyOnceWith('/login', { replace: true })
  })

  it.each(['Invalid token', 'Token expired'])('shows verification failure: %s', async message => {
    vi.mocked(apiClient.verifyEmail).mockRejectedValue(new Error(message))
    render(<VerifyEmailPage />)
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(apiClient.verifyEmail).toHaveBeenCalledTimes(1)
    expect(useI18nNavigate()).not.toHaveBeenCalled()
  })

  it.each(['', 'token='])('rejects an empty verification link: %s', search => {
    globalThis.__setMockSearchParams(search)
    render(<VerifyEmailPage />)
    expect(screen.getByText('auth.verifyEmail.invalidLink')).toBeInTheDocument()
    expect(apiClient.verifyEmail).not.toHaveBeenCalled()
    expect(useI18nNavigate()).not.toHaveBeenCalled()
  })
})
