import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SettingsPage from '../SettingsPage'
import { apiClient } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  apiClient: {
    getOpenAiApiKeyStatus: vi.fn(),
    saveOpenAiApiKey: vi.fn(),
    deleteOpenAiApiKey: vi.fn(),
    getIntegrationApiKeys: vi.fn(() => Promise.resolve([])),
    getMe: vi.fn(() =>
      Promise.resolve({ id: 1, username: 'testuser', email: 'test@example.com', video_count: 0, max_video_upload_size_mb: 500 }),
    ),
    isAuthenticated: vi.fn(() => Promise.resolve(true)),
  },
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1, username: 'testuser' }, isAuthenticated: true }),
}))

describe('SettingsPage - OpenAI API Key', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should show no-key state when key is not set', async () => {
    ;(apiClient.getOpenAiApiKeyStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      has_key: false,
      masked_key: null,
    })

    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('settings.openaiApiKey.title')).toBeInTheDocument()
    })
    expect(screen.getByText('settings.openaiApiKey.description')).toBeInTheDocument()
  })

  it('should show masked key when key is set', async () => {
    ;(apiClient.getOpenAiApiKeyStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      has_key: true,
      masked_key: 'sk-...abcd',
    })

    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('sk-...abcd')).toBeInTheDocument()
    })
    expect(screen.getByText('settings.openaiApiKey.configured')).toBeInTheDocument()
  })

  it('should save key on submit', async () => {
    ;(apiClient.getOpenAiApiKeyStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      has_key: false,
      masked_key: null,
    })
    ;(apiClient.saveOpenAiApiKey as ReturnType<typeof vi.fn>).mockResolvedValue({})

    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('settings.openaiApiKey.title')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('sk-...')
    fireEvent.change(input, { target: { value: 'sk-test-key-123' } })

    const saveButton = screen.getByText('settings.openaiApiKey.save')
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(apiClient.saveOpenAiApiKey).toHaveBeenCalledWith({ api_key: 'sk-test-key-123' })
    })
  })

  it('should show delete button when key exists', async () => {
    ;(apiClient.getOpenAiApiKeyStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      has_key: true,
      masked_key: 'sk-...abcd',
    })

    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('settings.openaiApiKey.delete')).toBeInTheDocument()
    })
  })
})
