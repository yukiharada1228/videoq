import { fireEvent, render, screen } from '@testing-library/react'
import { VideoUploadModal } from '../VideoUploadModal'
import { useVideoUpload } from '@/hooks/useVideoUpload'

vi.mock('@/hooks/useTags', () => ({
  useTags: vi.fn(() => ({
    tags: [],
    createTag: vi.fn(),
  })),
}))

vi.mock('@/hooks/useVideoUpload', () => ({
  useVideoUpload: vi.fn(),
}))

vi.mock('../VideoUploadFormFields', () => ({
  VideoUploadFormFields: () => <div data-testid="file-fields">file fields</div>,
}))

describe('VideoUploadModal', () => {
  const baseHook = {
    file: null,
    title: '',
    description: '',
    youtubeUrl: '',
    sourceMode: 'file' as const,
    tagIds: [],
    isUploading: false,
    error: null,
    errorParams: {},
    success: false,
    setTitle: vi.fn(),
    setDescription: vi.fn(),
    setYoutubeUrl: vi.fn(),
    setSourceMode: vi.fn(),
    setTagIds: vi.fn(),
    handleFileChange: vi.fn(),
    handleSubmit: vi.fn(),
    reset: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useVideoUpload as any).mockReturnValue(baseHook)
  })

  it('shows file upload fields by default', () => {
    render(<VideoUploadModal isOpen={true} onClose={vi.fn()} />)

    expect(screen.getByTestId('file-fields')).toBeInTheDocument()
    expect(screen.getByText('videos.upload.modes.file')).toBeInTheDocument()
    expect(screen.getByText('videos.upload.modes.youtube')).toBeInTheDocument()
  })

  it('switches to youtube mode when youtube tab is clicked', () => {
    render(<VideoUploadModal isOpen={true} onClose={vi.fn()} />)

    fireEvent.click(screen.getByText('videos.upload.modes.youtube'))

    expect(baseHook.setSourceMode).toHaveBeenCalledWith('youtube')
  })

  it('renders youtube url input in youtube mode', () => {
    ;(useVideoUpload as any).mockReturnValue({
      ...baseHook,
      sourceMode: 'youtube',
    })

    render(<VideoUploadModal isOpen={true} onClose={vi.fn()} />)

    expect(screen.getByLabelText('videos.upload.youtubeUrlLabel')).toBeInTheDocument()
    expect(screen.getByLabelText('videos.upload.titleLabel')).toBeInTheDocument()
    expect(screen.getByLabelText('videos.upload.descriptionLabel')).toBeInTheDocument()
  })
})
