import { render, screen, waitFor } from '@testing-library/react'
import { OpenAiKeyBanner } from '../OpenAiKeyBanner'
import { apiClient } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  apiClient: {
    getOpenAiApiKeyStatus: vi.fn(),
  },
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1 }, isAuthenticated: true }),
}))

describe('OpenAiKeyBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows banner when openai is required and key is not set', async () => {
    ;(apiClient.getOpenAiApiKeyStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      has_key: false,
      masked_key: null,
      is_required: true,
    })

    render(<OpenAiKeyBanner />)

    expect(await screen.findByText('openaiApiKey.banner.title')).toBeInTheDocument()
    expect(screen.getByText('openaiApiKey.banner.settingsLink')).toBeInTheDocument()
  })

  it('does not show banner when key is already set', async () => {
    ;(apiClient.getOpenAiApiKeyStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      has_key: true,
      masked_key: 'sk-...abcd',
      is_required: true,
    })

    render(<OpenAiKeyBanner />)

    await waitFor(() => {
      expect(screen.queryByText('openaiApiKey.banner.title')).not.toBeInTheDocument()
    })
  })

  it('does not show banner when openai is not required (local provider)', async () => {
    ;(apiClient.getOpenAiApiKeyStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      has_key: false,
      masked_key: null,
      is_required: false,
    })

    render(<OpenAiKeyBanner />)

    await waitFor(() => {
      expect(screen.queryByText('openaiApiKey.banner.title')).not.toBeInTheDocument()
    })
  })

  it('renders nothing while loading', () => {
    ;(apiClient.getOpenAiApiKeyStatus as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    )

    render(<OpenAiKeyBanner />)

    expect(screen.queryByText('openaiApiKey.banner.title')).not.toBeInTheDocument()
  })
})
