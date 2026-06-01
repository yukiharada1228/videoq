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
    globalThis.__setMockSearchParams('uid=test-uid&token=test-token')
  })

  afterEach(() => {
    globalThis.__setMockSearchParams('')
  })

  it('confirms email change from uid and token query params', async () => {
    ;(apiClient.confirmEmailChange as ReturnType<typeof vi.fn>).mockResolvedValue({})

    render(<EmailChangeConfirmPage />)

    await waitFor(() => {
      expect(apiClient.confirmEmailChange).toHaveBeenCalledWith({
        uid: 'test-uid',
        token: 'test-token',
      })
    })
    expect(await screen.findByText('auth.emailChange.success')).toBeInTheDocument()
  })

  it('shows invalid link state without calling the API', async () => {
    globalThis.__setMockSearchParams('')

    render(<EmailChangeConfirmPage />)

    expect(screen.getByText('auth.emailChange.invalidLink')).toBeInTheDocument()
    expect(apiClient.confirmEmailChange).not.toHaveBeenCalled()
  })
})
