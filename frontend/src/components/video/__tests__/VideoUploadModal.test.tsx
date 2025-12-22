import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { VideoUploadModal } from '../VideoUploadModal'
import { useVideoUpload } from '@/hooks/useVideoUpload'
import { useOpenAIApiKeyStatus } from '@/hooks/useOpenAIApiKeyStatus'

// Mock useVideoUpload
jest.mock('@/hooks/useVideoUpload', () => ({
  useVideoUpload: jest.fn(),
}))

jest.mock('@/hooks/useOpenAIApiKeyStatus')

// Mock VideoUploadFormFields
jest.mock('../VideoUploadFormFields', () => ({
  VideoUploadFormFields: ({ title, description, isUploading, error, success, setTitle, setDescription, handleFileChange }: {
    title: string
    description: string
    isUploading: boolean
    error: string | null
    success: boolean
    setTitle: (value: string) => void
    setDescription: (value: string) => void
    handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  }) => (
    <div>
      <input
        type="file"
        data-testid="file-input"
        onChange={handleFileChange}
      />
      <input
        type="text"
        data-testid="title-input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        data-testid="description-input"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      {isUploading && <div data-testid="uploading">Uploading...</div>}
      {error && <div data-testid="error">{error}</div>}
      {success && <div data-testid="success">Success!</div>}
    </div>
  ),
}))

describe('VideoUploadModal', () => {
  const mockUseVideoUpload = {
    file: null,
    title: '',
    description: '',
    isUploading: false,
    error: null,
    success: false,
    setTitle: jest.fn(),
    setDescription: jest.fn(),
    handleFileChange: jest.fn(),
    handleSubmit: jest.fn((e) => e.preventDefault()),
    reset: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useVideoUpload as jest.Mock).mockReturnValue(mockUseVideoUpload)
    ;(useOpenAIApiKeyStatus as jest.Mock).mockReturnValue({
      hasApiKey: true,
      isChecking: false,
      error: null,
      refresh: jest.fn(),
    })
  })

  it('should render modal when isOpen is true', () => {
    render(<VideoUploadModal isOpen={true} onClose={jest.fn()} />)
    
    expect(screen.getByText(/videos.upload.title/)).toBeInTheDocument()
  })

  it('should not render modal when isOpen is false', () => {
    render(<VideoUploadModal isOpen={false} onClose={jest.fn()} />)
    
    expect(screen.queryByText(/videos.upload.title/)).not.toBeInTheDocument()
  })

  it('should call onClose when cancel button is clicked', () => {
    const onClose = jest.fn()
    render(<VideoUploadModal isOpen={true} onClose={onClose} />)
    
    const cancelButton = screen.getByText(/common.actions.cancel/)
    fireEvent.click(cancelButton)
    
    expect(onClose).toHaveBeenCalled()
    expect(mockUseVideoUpload.reset).toHaveBeenCalled()
  })

  it('should not close when uploading', () => {
    const onClose = jest.fn()
    ;(useVideoUpload as jest.Mock).mockReturnValue({
      ...mockUseVideoUpload,
      isUploading: true,
    })

    render(<VideoUploadModal isOpen={true} onClose={onClose} />)
    
    const cancelButton = screen.getByText(/common.actions.cancel/)
    expect(cancelButton).toBeDisabled()
  })

  it('should call onUploadSuccess and close when upload succeeds', async () => {
    jest.useFakeTimers()
    const onClose = jest.fn()
    const onUploadSuccess = jest.fn()
    
    ;(useVideoUpload as jest.Mock).mockReturnValue({
      ...mockUseVideoUpload,
      success: true,
    })

    render(<VideoUploadModal isOpen={true} onClose={onClose} onUploadSuccess={onUploadSuccess} />)

    act(() => {
      jest.advanceTimersByTime(2000)
    })

    await waitFor(() => {
      expect(onUploadSuccess).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })

    jest.useRealTimers()
  })
})

