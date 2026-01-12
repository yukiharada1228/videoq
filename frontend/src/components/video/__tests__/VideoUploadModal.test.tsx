import { render, screen, fireEvent, act } from '@testing-library/react'
import { VideoUploadModal } from '../VideoUploadModal'
import { useVideoUpload } from '@/hooks/useVideoUpload'
import { useOpenAIApiKeyStatus } from '@/hooks/useOpenAIApiKeyStatus'
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

vi.mock('@/hooks/useOpenAIApiKeyStatus')

// Mock useVideoGroups (avoid real API calls)
vi.mock('@/hooks/useVideoGroups', () => ({
  useVideoGroups: vi.fn(),
}))

// Mock VideoUploadFormFields
vi.mock('../VideoUploadFormFields', () => ({
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
    setTitle: vi.fn(),
    setDescription: vi.fn(),
    handleFileChange: vi.fn(),
    handleSubmit: vi.fn((e) => e.preventDefault()),
    reset: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
      ; (useVideoUpload as any).mockReturnValue(mockUseVideoUpload)
      ; (useOpenAIApiKeyStatus as any).mockReturnValue({
        hasApiKey: true,
        isChecking: false,
        error: null,
        refresh: vi.fn(),
      })
      ; (useVideoGroups as any).mockReturnValue({ groups: [], isLoading: false, error: null, refetch: vi.fn() })
  })

  it('should render modal when isOpen is true', () => {
    render(<VideoUploadModal isOpen={true} onClose={vi.fn()} />)

    expect(screen.getByText(/videos.upload.title/)).toBeInTheDocument()
  })

  it('should not render modal when isOpen is false', () => {
    render(<VideoUploadModal isOpen={false} onClose={vi.fn()} />)

    expect(screen.queryByText(/videos.upload.title/)).not.toBeInTheDocument()
  })

  it('should call onClose when cancel button is clicked', () => {
    const onClose = vi.fn()
    render(<VideoUploadModal isOpen={true} onClose={onClose} />)

    const cancelButton = screen.getByText(/common.actions.cancel/)
    fireEvent.click(cancelButton)

    expect(onClose).toHaveBeenCalled()
    expect(mockUseVideoUpload.reset).toHaveBeenCalled()
  })

  it('should not close when uploading', () => {
    const onClose = vi.fn()
      ; (useVideoUpload as any).mockReturnValue({
        ...mockUseVideoUpload,
        isUploading: true,
      })

    render(<VideoUploadModal isOpen={true} onClose={onClose} />)

    const cancelButton = screen.getByText(/common.actions.cancel/)
    expect(cancelButton).toBeDisabled()
  })

  it('should call onUploadSuccess and close when upload succeeds', async () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    const onUploadSuccess = vi.fn()

      ; (useVideoUpload as any).mockReturnValue({
        ...mockUseVideoUpload,
        success: true,
      })

    render(<VideoUploadModal isOpen={true} onClose={onClose} onUploadSuccess={onUploadSuccess} />)

    // Flush effects, then advance timers for the delayed close
    await act(async () => { })
    expect(onUploadSuccess).toHaveBeenCalled()
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    expect(onClose).toHaveBeenCalled()

    vi.useRealTimers()
  })
})

