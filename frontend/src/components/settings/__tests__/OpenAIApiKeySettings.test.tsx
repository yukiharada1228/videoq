import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { OpenAIApiKeySettings } from '../OpenAIApiKeySettings'
import { apiClient } from '@/lib/api'
import { setOpenAIApiKeyStatusCache } from '@/hooks/useOpenAIApiKeyStatus'

vi.mock('@/lib/api', () => ({
  apiClient: {
    setOpenAIApiKey: vi.fn(),
    deleteOpenAIApiKey: vi.fn(),
  },
}))

vi.mock('@/hooks/useOpenAIApiKeyStatus', () => ({
  setOpenAIApiKeyStatusCache: vi.fn(),
}))

describe('OpenAIApiKeySettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('saves api key successfully and calls callbacks', async () => {
    const onApiKeyChange = vi.fn()
    ;(apiClient.setOpenAIApiKey as any).mockResolvedValue(undefined)

    render(<OpenAIApiKeySettings hasApiKey={false} onApiKeyChange={onApiKeyChange} />)

    const input = screen.getByLabelText('settings.openaiApiKey.apiKeyLabel')

    await act(async () => {
      fireEvent.change(input, { target: { value: 'sk-test' } })
    })

    const saveButton = screen.getByRole('button', { name: 'settings.openaiApiKey.save' })

    await act(async () => {
      fireEvent.click(saveButton)
    })

    await waitFor(() => {
      expect(apiClient.setOpenAIApiKey).toHaveBeenCalledWith({ api_key: 'sk-test' })
    })

    expect(screen.getByText('settings.openaiApiKey.successSaved')).toBeInTheDocument()
    expect(screen.getByText('settings.openaiApiKey.hasApiKeyMessage')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'settings.openaiApiKey.delete' })).toBeInTheDocument()

    expect(setOpenAIApiKeyStatusCache).toHaveBeenCalledWith(true)
    expect(onApiKeyChange).toHaveBeenCalledTimes(1)
  })

  it('shows error message when save fails with Error', async () => {
    const onApiKeyChange = vi.fn()
    ;(apiClient.setOpenAIApiKey as any).mockRejectedValue(new Error('save failed'))

    render(<OpenAIApiKeySettings hasApiKey={false} onApiKeyChange={onApiKeyChange} />)

    const input = screen.getByLabelText('settings.openaiApiKey.apiKeyLabel')

    await act(async () => {
      fireEvent.change(input, { target: { value: 'sk-test' } })
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'settings.openaiApiKey.save' }))
    })

    await waitFor(() => {
      expect(screen.getByText('save failed')).toBeInTheDocument()
    })

    expect(setOpenAIApiKeyStatusCache).not.toHaveBeenCalled()
    expect(onApiKeyChange).not.toHaveBeenCalled()
  })

  it('does not delete when confirm is cancelled', async () => {
    const onApiKeyChange = vi.fn()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<OpenAIApiKeySettings hasApiKey={true} onApiKeyChange={onApiKeyChange} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'settings.openaiApiKey.delete' }))
    })

    expect(apiClient.deleteOpenAIApiKey).not.toHaveBeenCalled()
    expect(setOpenAIApiKeyStatusCache).not.toHaveBeenCalled()
    expect(onApiKeyChange).not.toHaveBeenCalled()

    confirmSpy.mockRestore()
  })

  it('deletes api key successfully when confirmed', async () => {
    const onApiKeyChange = vi.fn()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    ;(apiClient.deleteOpenAIApiKey as any).mockResolvedValue(undefined)

    render(<OpenAIApiKeySettings hasApiKey={true} onApiKeyChange={onApiKeyChange} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'settings.openaiApiKey.delete' }))
    })

    await waitFor(() => {
      expect(apiClient.deleteOpenAIApiKey).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByText('settings.openaiApiKey.successDeleted')).toBeInTheDocument()
    expect(screen.getByText('settings.openaiApiKey.noApiKeyMessage')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'settings.openaiApiKey.delete' })).not.toBeInTheDocument()

    expect(setOpenAIApiKeyStatusCache).toHaveBeenCalledWith(false)
    expect(onApiKeyChange).toHaveBeenCalledTimes(1)
  })
})
