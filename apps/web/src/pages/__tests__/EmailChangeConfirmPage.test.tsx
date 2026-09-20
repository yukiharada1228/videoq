import { render, screen, waitFor } from '@testing-library/react'
import EmailChangeConfirmPage from '../EmailChangeConfirmPage'
import { apiClient } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  apiClient: {
    confirmEmailChange: vi.fn(),
  },
}))

describe('EmailChangeConfirmPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.__setMockSearchParams('token=test-token')
  })

  afterEach(() => {
    globalThis.__setMockSearchParams('')
  })

  it('confirms email change when token query is present', async () => {
    ;(apiClient.confirmEmailChange as ReturnType<typeof vi.fn>).mockResolvedValue({ requiresNewEmailVerification: false })

    render(<EmailChangeConfirmPage />)

    await waitFor(() => {
      expect(apiClient.confirmEmailChange).toHaveBeenCalledWith({
        token: 'test-token',
      })
    })
    expect(await screen.findByText('auth.emailChange.success')).toBeInTheDocument()
  })

  it('shows success for Better Auth callback without calling confirm', async () => {
    globalThis.__setMockSearchParams('')

    render(<EmailChangeConfirmPage />)

    expect(await screen.findByText('auth.emailChange.success')).toBeInTheDocument()
    expect(apiClient.confirmEmailChange).not.toHaveBeenCalled()
  })

  it('shows error when error query is present', async () => {
    globalThis.__setMockSearchParams('error=access_denied')

    render(<EmailChangeConfirmPage />)

    expect(await screen.findByText('auth.emailChange.error')).toBeInTheDocument()
    expect(apiClient.confirmEmailChange).not.toHaveBeenCalled()
  })

  it('asks for new-address verification after current-address approval', async () => {
    globalThis.__setMockSearchParams('step=verify-new')

    render(<EmailChangeConfirmPage />)

    expect(await screen.findByText('auth.emailChange.pendingVerification')).toBeInTheDocument()
    expect(screen.queryByText('auth.emailChange.success')).not.toBeInTheDocument()
    expect(apiClient.confirmEmailChange).not.toHaveBeenCalled()
  })

  it('shows an approval error even when the callback has a pending step', async () => {
    globalThis.__setMockSearchParams('step=verify-new&error=INVALID_TOKEN')

    render(<EmailChangeConfirmPage />)

    expect(await screen.findByText('auth.emailChange.error')).toBeInTheDocument()
    expect(screen.queryByText('auth.emailChange.pendingVerification')).not.toBeInTheDocument()
  })

  it('keeps token handoff approval pending until the new address is verified', async () => {
    vi.mocked(apiClient.confirmEmailChange).mockResolvedValueOnce({ requiresNewEmailVerification: true })

    render(<EmailChangeConfirmPage />)

    expect(await screen.findByText('auth.emailChange.pendingVerification')).toBeInTheDocument()
    expect(screen.queryByText('auth.emailChange.success')).not.toBeInTheDocument()
  })
})
