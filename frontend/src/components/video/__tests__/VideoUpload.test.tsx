import { render, screen, act } from '@testing-library/react'
import { VideoUpload } from '../VideoUpload'
import { useVideoUpload } from '@/hooks/useVideoUpload'
import { useVideoGroups } from '@/hooks/useVideoGroups'

// Mock useTags
vi.mock('@/hooks/useTags', () => ({
  useTags: vi.fn(() => ({
    tags: [],
    isLoading: false,
    error: null,
    loadTags: vi.fn(),
    refetchTags: vi.fn(),
    createTag: vi.fn(),
    updateTag: vi.fn(),
    deleteTag: vi.fn(),
  })),
}))

// Mock useVideoUpload
vi.mock('@/hooks/useVideoUpload', () => ({
  useVideoUpload: vi.fn(),
}))

// Mock useVideoGroups (avoid real API calls)
vi.mock('@/hooks/useVideoGroups', () => ({
  useVideoGroups: vi.fn(),
}))

// Mock VideoUploadFormFields
vi.mock('../VideoUploadFormFields', () => ({
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
    setTitle: vi.fn(),
    setDescription: vi.fn(),
    handleFileChange: vi.fn(),
    handleSubmit: vi.fn(),
    reset: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
      ; (useVideoGroups as any).mockReturnValue({ groups: [], isLoading: false, error: null, refetch: vi.fn() })
      ; (useVideoUpload as any).mockReturnValue(mockUseVideoUpload)
  })

  it('should render upload form', () => {
    render(<VideoUpload />)

    expect(screen.getByTestId('file-input')).toBeInTheDocument()
    expect(screen.getByTestId('title-input')).toBeInTheDocument()
    expect(screen.getByTestId('description-input')).toBeInTheDocument()
  })

  it('should call onUploadSuccess when upload succeeds', async () => {
    vi.useFakeTimers()
    const onUploadSuccess = vi.fn()

      ; (useVideoUpload as any).mockReturnValue({
        ...mockUseVideoUpload,
        success: true,
      })

    render(<VideoUpload onUploadSuccess={onUploadSuccess} />)

    // Flush effects that schedule the timeout, then advance timers
    await act(async () => { })
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    expect(mockUseVideoUpload.reset).toHaveBeenCalled()
    expect(onUploadSuccess).toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('should display error when error occurs', () => {
    ; (useVideoUpload as any).mockReturnValue({
      ...mockUseVideoUpload,
      error: 'Upload failed',
    })

    render(<VideoUpload />)

    expect(screen.getByTestId('error')).toHaveTextContent('Upload failed')
  })

  it('should display uploading state', () => {
    ; (useVideoUpload as any).mockReturnValue({
      ...mockUseVideoUpload,
      isUploading: true,
    })

    render(<VideoUpload />)

    expect(screen.getByTestId('uploading')).toBeInTheDocument()
  })
})

