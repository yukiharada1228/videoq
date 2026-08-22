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
      updateUsername: vi.fn(() => Promise.resolve()),
      createIntegrationApiKey: vi.fn(),
      revokeIntegrationApiKey: vi.fn(),
      saveSearchApiKey: vi.fn(),
      deleteSearchApiKey: vi.fn(),
      createBillingPortal: vi.fn(),
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

  it('stacks the integration API keys header on narrow layouts', async () => {
    render(<SettingsPage />)

    const title = await screen.findByRole('heading', {
      name: 'settings.integrationApiKeys.title',
    })
    const header = title.closest('.mb-5')
    expect(header).toHaveClass('flex-col')
    expect(header).toHaveClass('sm:flex-row')

    const createButton = screen.getByRole('button', {
      name: 'settings.integrationApiKeys.create',
    })
    expect(createButton).toHaveClass('w-full')
    expect(createButton).toHaveClass('sm:w-auto')
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

describe('SettingsPage username change', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the current username and username change form', async () => {
    render(<SettingsPage />)

    expect(await screen.findByText('settings.usernameChange.title')).toBeInTheDocument()
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByLabelText('settings.usernameChange.newUsernameLabel')).toBeInTheDocument()
  })

  it('updates the username from the settings form', async () => {
    render(<SettingsPage />)

    const input = await screen.findByLabelText('settings.usernameChange.newUsernameLabel')
    fireEvent.change(input, { target: { value: 'alice_new' } })
    fireEvent.click(screen.getByText('settings.usernameChange.submit'))

    await waitFor(() => {
      expect(apiClient.updateUsername).toHaveBeenCalledWith({ username: 'alice_new' })
    })
    expect(await screen.findByText('settings.usernameChange.success')).toBeInTheDocument()
  })

  it('does not call the API when the username is empty', async () => {
    render(<SettingsPage />)

    const input = await screen.findByLabelText('settings.usernameChange.newUsernameLabel')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.click(screen.getByText('settings.usernameChange.submit'))

    expect(apiClient.updateUsername).not.toHaveBeenCalled()
    expect(screen.getByText('settings.usernameChange.errorEmpty')).toBeInTheDocument()
  })

  it('does not call the API when the username is unchanged', async () => {
    render(<SettingsPage />)

    const input = await screen.findByLabelText('settings.usernameChange.newUsernameLabel')
    await waitFor(() => {
      expect(input).toHaveValue('alice')
    })
    fireEvent.click(screen.getByText('settings.usernameChange.submit'))

    expect(apiClient.updateUsername).not.toHaveBeenCalled()
    expect(screen.getByText('settings.usernameChange.errorUnchanged')).toBeInTheDocument()
  })

  it('maps a taken username error to the settings copy', async () => {
    vi.mocked(apiClient.updateUsername).mockRejectedValueOnce(
      Object.assign(new Error('Username is already taken'), {
        code: 'USERNAME_IS_ALREADY_TAKEN',
      }),
    )
    render(<SettingsPage />)

    const input = await screen.findByLabelText('settings.usernameChange.newUsernameLabel')
    fireEvent.change(input, { target: { value: 'taken_name' } })
    fireEvent.click(screen.getByText('settings.usernameChange.submit'))

    expect(await screen.findByText('settings.usernameChange.errorTaken')).toBeInTheDocument()
  })
})
