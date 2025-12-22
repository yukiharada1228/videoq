import { render, screen, waitFor, act } from '@testing-library/react'
import { VideoUpload } from '../VideoUpload'
import { useVideoUpload } from '@/hooks/useVideoUpload'

// Mock useVideoUpload
jest.mock('@/hooks/useVideoUpload', () => ({
  useVideoUpload: jest.fn(),
}))

// Mock VideoUploadFormFields
jest.mock('../VideoUploadFormFields', () => ({
  VideoUploadFormFields: ({ title, description, isUploading, error, onFileChange, onTitleChange, onDescriptionChange }: {
    title: string
    description: string
    isUploading: boolean
    error: string | null
    onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
    onTitleChange: (value: string) => void
    onDescriptionChange: (value: string) => void
  }) => (
    <div>
      <input
        type="file"
        data-testid="file-input"
        onChange={onFileChange}
      />
      <input
        type="text"
        data-testid="title-input"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
      />
      <input
        type="text"
        data-testid="description-input"
        value={description}
        onChange={(e) => onDescriptionChange(e.target.value)}
      />
      {isUploading && <div data-testid="uploading">Uploading...</div>}
      {error && <div data-testid="error">{error}</div>}
    </div>
  ),
}))

describe('VideoUpload', () => {
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
    handleSubmit: jest.fn(),
    reset: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useVideoUpload as jest.Mock).mockReturnValue(mockUseVideoUpload)
  })

  it('should render upload form', () => {
    render(<VideoUpload />)
    
    expect(screen.getByTestId('file-input')).toBeInTheDocument()
    expect(screen.getByTestId('title-input')).toBeInTheDocument()
    expect(screen.getByTestId('description-input')).toBeInTheDocument()
  })

  it('should call onUploadSuccess when upload succeeds', async () => {
    jest.useFakeTimers()
    const onUploadSuccess = jest.fn()
    
    ;(useVideoUpload as jest.Mock).mockReturnValue({
      ...mockUseVideoUpload,
      success: true,
    })

    render(<VideoUpload onUploadSuccess={onUploadSuccess} />)

    act(() => {
      jest.advanceTimersByTime(2000)
    })

    await waitFor(() => {
      expect(mockUseVideoUpload.reset).toHaveBeenCalled()
      expect(onUploadSuccess).toHaveBeenCalled()
    })

    jest.useRealTimers()
  })

  it('should display error when error occurs', () => {
    ;(useVideoUpload as jest.Mock).mockReturnValue({
      ...mockUseVideoUpload,
      error: 'Upload failed',
    })

    render(<VideoUpload />)
    
    expect(screen.getByTestId('error')).toHaveTextContent('Upload failed')
  })

  it('should display uploading state', () => {
    ;(useVideoUpload as jest.Mock).mockReturnValue({
      ...mockUseVideoUpload,
      isUploading: true,
    })

    render(<VideoUpload />)
    
    expect(screen.getByTestId('uploading')).toBeInTheDocument()
  })
})

