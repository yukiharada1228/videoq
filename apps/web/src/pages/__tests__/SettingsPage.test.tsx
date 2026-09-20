import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
      getAuthorizedOAuthTokens: vi.fn(() => Promise.resolve([])),
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
    globalThis.__setTrpcHandler('account.searchApiKeyStatus', () => ({ has_api_key: false }))
  })

  it('renders the current email address without opening the change form', async () => {
    render(<SettingsPage />)

    expect(await screen.findByText('settings.emailChange.title')).toBeInTheDocument()
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    expect(screen.queryByLabelText('settings.emailChange.newEmailLabel')).not.toBeInTheDocument()
  })

  it('requests an email change from the settings form', async () => {
    render(<SettingsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'settings.emailChange.edit' }))
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

    fireEvent.click(screen.getByRole('button', { name: 'settings.emailChange.edit' }))
    const input = await screen.findByLabelText('settings.emailChange.newEmailLabel')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.click(screen.getByText('settings.emailChange.submit'))

    expect(apiClient.requestEmailChange).not.toHaveBeenCalled()
    expect(screen.getByText('settings.emailChange.submit')).toBeDisabled()
  })
})

describe('SettingsPage username change', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.__setTrpcHandler('account.searchApiKeyStatus', () => ({ has_api_key: false }))
  })

  it('renders the current username without opening the change form', async () => {
    render(<SettingsPage />)

    expect(await screen.findByText('settings.usernameChange.title')).toBeInTheDocument()
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.queryByLabelText('settings.usernameChange.newUsernameLabel')).not.toBeInTheDocument()
  })

  it('updates the username from the settings form', async () => {
    render(<SettingsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'settings.usernameChange.edit' }))
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

    fireEvent.click(screen.getByRole('button', { name: 'settings.usernameChange.edit' }))
    const input = await screen.findByLabelText('settings.usernameChange.newUsernameLabel')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.click(screen.getByText('settings.usernameChange.submit'))

    expect(apiClient.updateUsername).not.toHaveBeenCalled()
    expect(screen.getByText('settings.usernameChange.submit')).toBeDisabled()
  })

  it('does not call the API when the username is unchanged', async () => {
    render(<SettingsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'settings.usernameChange.edit' }))
    const input = await screen.findByLabelText('settings.usernameChange.newUsernameLabel')
    await waitFor(() => {
      expect(input).toHaveValue('alice')
    })
    fireEvent.click(screen.getByText('settings.usernameChange.submit'))

    expect(apiClient.updateUsername).not.toHaveBeenCalled()
    expect(screen.getByText('settings.usernameChange.submit')).toBeDisabled()
  })

  it('maps a taken username error to the settings copy', async () => {
    vi.mocked(apiClient.updateUsername).mockRejectedValueOnce(
      Object.assign(new Error('Username is already taken'), {
        code: 'USERNAME_IS_ALREADY_TAKEN',
      }),
    )
    render(<SettingsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'settings.usernameChange.edit' }))
    const input = await screen.findByLabelText('settings.usernameChange.newUsernameLabel')
    fireEvent.change(input, { target: { value: 'taken_name' } })
    fireEvent.click(screen.getByText('settings.usernameChange.submit'))

    expect(await screen.findByText('settings.usernameChange.errorTaken')).toBeInTheDocument()
  })
})


describe('SettingsPage interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.__setTrpcHandler('account.searchApiKeyStatus', () => ({ has_api_key: false }))
  })

  it('groups settings by task and links to each section', () => {
    render(<SettingsPage />)
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'settings.account.title', 'settings.billing.title', 'settings.searchApiKey.title', 'settings.integrations.title',
    ])
    const navigation = screen.getByRole('navigation', { name: 'settings.navigation' })
    for (const link of within(navigation).getAllByRole('link')) {
      expect(document.querySelector(link.getAttribute('href')!)).toBeInTheDocument()
    }
  })

  it('discards a cancelled edit and returns focus to its change button', () => {
    render(<SettingsPage />)
    const edit = screen.getByRole('button', { name: 'settings.usernameChange.edit' })
    fireEvent.click(edit)
    const input = screen.getByLabelText('settings.usernameChange.newUsernameLabel')
    expect(input).toHaveFocus()
    fireEvent.change(input, { target: { value: 'unsaved' } })
    fireEvent.click(within(screen.getByRole('form')).getByRole('button', { name: 'settings.cancel' }))
    expect(edit).toHaveFocus()
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    expect(apiClient.updateUsername).not.toHaveBeenCalled()
    fireEvent.click(edit)
    expect(screen.getByLabelText('settings.usernameChange.newUsernameLabel')).toHaveValue('alice')
  })

  it('keeps the current email until verification and closes the editor after sending', async () => {
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'settings.emailChange.edit' }))
    fireEvent.change(screen.getByLabelText('settings.emailChange.newEmailLabel'), { target: { value: 'new@example.com' } })
    fireEvent.click(screen.getByText('settings.emailChange.submit'))
    expect(await screen.findByText('settings.emailChange.success')).toBeInTheDocument()
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    expect(screen.queryByLabelText('settings.emailChange.newEmailLabel')).not.toBeInTheDocument()
  })

  it('masks the SearchAPI key and prevents empty saves', async () => {
    render(<SettingsPage />)
    const input = await screen.findByLabelText('settings.searchApiKey.apiKeyLabel')
    expect(input).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'settings.searchApiKey.save' })).toBeDisabled()
    fireEvent.change(input, { target: { value: 'fixture-key' } })
    fireEvent.click(screen.getByRole('button', { name: 'settings.searchApiKey.show' }))
    expect(input).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'settings.searchApiKey.save' })).toBeEnabled()
  })

  it('confirms SearchAPI deletion before calling the API', async () => {
    const remove = vi.fn(() => ({ success: true }))
    globalThis.__setTrpcHandler('account.searchApiKeyStatus', () => ({ has_api_key: true }))
    globalThis.__setTrpcHandler('account.deleteSearchApiKey', remove)
    render(<SettingsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'settings.searchApiKey.delete' }))
    expect(remove).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'settings.cancel' }))
    expect(remove).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'settings.searchApiKey.delete' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'settings.searchApiKey.delete' }))
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('shows a load error instead of claiming SearchAPI is not configured', async () => {
    globalThis.__setTrpcHandler('account.searchApiKeyStatus', () => { throw new Error('Unavailable') })
    render(<SettingsPage />)
    expect(await screen.findByText('settings.searchApiKey.errorLoading')).toBeInTheDocument()
    expect(screen.queryByText('settings.searchApiKey.notConfigured')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('settings.searchApiKey.apiKeyLabel')).not.toBeInTheDocument()
  })

  it('saves a trimmed SearchAPI key and collapses the configured editor', async () => {
    let configured = false
    const save = vi.fn(() => { configured = true; return { success: true } })
    globalThis.__setTrpcHandler('account.searchApiKeyStatus', () => ({ has_api_key: configured }))
    globalThis.__setTrpcHandler('account.saveSearchApiKey', save)
    render(<SettingsPage />)
    fireEvent.change(await screen.findByLabelText('settings.searchApiKey.apiKeyLabel'), { target: { value: '  fixture-key  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'settings.searchApiKey.save' }))
    await waitFor(() => expect(save).toHaveBeenCalledWith({ apiKey: 'fixture-key' }))
    expect(await screen.findByText('settings.searchApiKey.configured')).toBeInTheDocument()
    expect(screen.queryByLabelText('settings.searchApiKey.apiKeyLabel')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'settings.searchApiKey.edit' }))
    expect(screen.getByLabelText('settings.searchApiKey.apiKeyLabel')).toHaveValue('')
  })

  it('creates a developer key with the selected permissions', async () => {
    vi.mocked(apiClient.createIntegrationApiKey).mockResolvedValueOnce({
      id: 'key-1', name: 'Notes', prefix: 'vq_test', access_level: 'read_only',
      last_used_at: null, created_at: '2026-09-01T00:00:00Z', api_key: 'fixture-only-secret',
    })
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'settings.integrationApiKeys.create' }))
    fireEvent.change(screen.getByLabelText('settings.integrationApiKeys.nameLabel'), { target: { value: 'Notes' } })
    fireEvent.click(screen.getByRole('button', { name: /settings.integrationApiKeys.permissions.readOnlyTitle/ }))
    fireEvent.click(screen.getByRole('button', { name: 'settings.integrationApiKeys.createDialogCta' }))
    await waitFor(() => expect(apiClient.createIntegrationApiKey).toHaveBeenCalledWith({ name: 'Notes', access_level: 'read_only' }))
    expect(await screen.findByText('fixture-only-secret')).toBeInTheDocument()
  })

  it('requires confirmation and displays revoke failures inside the key dialog', async () => {
    vi.mocked(apiClient.getIntegrationApiKeys).mockResolvedValueOnce([{
      id: 'key-1', config_id: 'read-write', name: 'Notes', prefix: 'vq_test', access_level: 'all',
      last_used_at: null, created_at: '2026-09-01T00:00:00Z',
    }])
    vi.mocked(apiClient.revokeIntegrationApiKey).mockRejectedValueOnce(new Error('Please retry'))
    render(<SettingsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'settings.integrationApiKeys.revoke: Notes' }))
    expect(apiClient.revokeIntegrationApiKey).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'settings.integrationApiKeys.revokeConfirmCta' }))
    expect(await within(dialog).findByText('Please retry')).toBeInTheDocument()
    expect(apiClient.revokeIntegrationApiKey).toHaveBeenCalledWith('key-1', 'read-write')
  })
})
