import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { OpenAIApiKeySettings } from '../OpenAIApiKeySettings'
import { apiClient } from '@/lib/api'
import { setOpenAIApiKeyStatusCache } from '@/hooks/useOpenAIApiKeyStatus'

jest.mock('@/lib/api', () => ({
  apiClient: {
    setOpenAIApiKey: jest.fn(),
    deleteOpenAIApiKey: jest.fn(),
  },
}))

jest.mock('@/hooks/useOpenAIApiKeyStatus', () => ({
  setOpenAIApiKeyStatusCache: jest.fn(),
}))

describe('OpenAIApiKeySettings', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('saves api key successfully and calls callbacks', async () => {
    const onApiKeyChange = jest.fn()
    ;(apiClient.setOpenAIApiKey as jest.Mock).mockResolvedValue(undefined)

    render(<OpenAIApiKeySettings hasApiKey={false} onApiKeyChange={onApiKeyChange} />)

    const input = screen.getByLabelText('apiKeyLabel')

    await act(async () => {
      fireEvent.change(input, { target: { value: 'sk-test' } })
    })

    const saveButton = screen.getByRole('button', { name: 'save' })

    await act(async () => {
      fireEvent.click(saveButton)
    })

    await waitFor(() => {
      expect(apiClient.setOpenAIApiKey).toHaveBeenCalledWith({ api_key: 'sk-test' })
    })

    expect(screen.getByText('successSaved')).toBeInTheDocument()
    expect(screen.getByText('hasApiKeyMessage')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'delete' })).toBeInTheDocument()

    expect(setOpenAIApiKeyStatusCache).toHaveBeenCalledWith(true)
    expect(onApiKeyChange).toHaveBeenCalledTimes(1)
  })

  it('shows error message when save fails with Error', async () => {
    const onApiKeyChange = jest.fn()
    ;(apiClient.setOpenAIApiKey as jest.Mock).mockRejectedValue(new Error('save failed'))

    render(<OpenAIApiKeySettings hasApiKey={false} onApiKeyChange={onApiKeyChange} />)

    const input = screen.getByLabelText('apiKeyLabel')

    await act(async () => {
      fireEvent.change(input, { target: { value: 'sk-test' } })
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'save' }))
    })

    await waitFor(() => {
      expect(screen.getByText('save failed')).toBeInTheDocument()
    })

    expect(setOpenAIApiKeyStatusCache).not.toHaveBeenCalled()
    expect(onApiKeyChange).not.toHaveBeenCalled()
  })

  it('does not delete when confirm is cancelled', async () => {
    const onApiKeyChange = jest.fn()
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false)

    render(<OpenAIApiKeySettings hasApiKey={true} onApiKeyChange={onApiKeyChange} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'delete' }))
    })

    expect(apiClient.deleteOpenAIApiKey).not.toHaveBeenCalled()
    expect(setOpenAIApiKeyStatusCache).not.toHaveBeenCalled()
    expect(onApiKeyChange).not.toHaveBeenCalled()

    confirmSpy.mockRestore()
  })

  it('deletes api key successfully when confirmed', async () => {
    const onApiKeyChange = jest.fn()
    jest.spyOn(window, 'confirm').mockReturnValue(true)
    ;(apiClient.deleteOpenAIApiKey as jest.Mock).mockResolvedValue(undefined)

    render(<OpenAIApiKeySettings hasApiKey={true} onApiKeyChange={onApiKeyChange} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'delete' }))
    })

    await waitFor(() => {
      expect(apiClient.deleteOpenAIApiKey).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByText('successDeleted')).toBeInTheDocument()
    expect(screen.getByText('noApiKeyMessage')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'delete' })).not.toBeInTheDocument()

    expect(setOpenAIApiKeyStatusCache).toHaveBeenCalledWith(false)
    expect(onApiKeyChange).toHaveBeenCalledTimes(1)
  })
})
