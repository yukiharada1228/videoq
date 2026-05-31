import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import SettingsPage from '../SettingsPage'
import { apiClient } from '@/lib/api'

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 1,
      username: 'alice',
      email: 'alice@example.com',
      video_count: 0,
      max_video_upload_size_mb: 500,
    },
    isLoading: false,
    refetch: vi.fn(),
  }),
}))

vi.mock('@/lib/api', () => {
  class ApiError extends Error {}
  return {
    ApiError,
    apiClient: {
      getIntegrationApiKeys: vi.fn(() => Promise.resolve([])),
      getSearchApiKeyStatus: vi.fn(() => Promise.resolve({ has_api_key: false })),
      requestEmailChange: vi.fn(() => Promise.resolve()),
      deleteAccount: vi.fn(() => Promise.resolve()),
      createIntegrationApiKey: vi.fn(),
      revokeIntegrationApiKey: vi.fn(),
      saveSearchApiKey: vi.fn(),
      deleteSearchApiKey: vi.fn(),
    },
  }
})

describe('SettingsPage email change', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the current email address and email change form', async () => {
    render(<SettingsPage />)

    expect(await screen.findByText('settings.emailChange.title')).toBeInTheDocument()
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    expect(screen.getByLabelText('settings.emailChange.newEmailLabel')).toBeInTheDocument()
  })

  it('requests an email change from the settings form', async () => {
    render(<SettingsPage />)

    const input = await screen.findByLabelText('settings.emailChange.newEmailLabel')
    fireEvent.change(input, { target: { value: 'new@example.com' } })
    fireEvent.click(screen.getByText('settings.emailChange.submit'))

    await waitFor(() => {
      expect(apiClient.requestEmailChange).toHaveBeenCalledWith({ email: 'new@example.com' })
    })
    expect(await screen.findByText('settings.emailChange.success')).toBeInTheDocument()
  })

  it('does not call the API when the new email is empty', async () => {
    render(<SettingsPage />)

    const input = await screen.findByLabelText('settings.emailChange.newEmailLabel')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.click(screen.getByText('settings.emailChange.submit'))

    expect(apiClient.requestEmailChange).not.toHaveBeenCalled()
    expect(screen.getByText('settings.emailChange.errorEmpty')).toBeInTheDocument()
  })
})
