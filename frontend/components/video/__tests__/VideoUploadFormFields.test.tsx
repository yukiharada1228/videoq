import { render, screen, fireEvent } from '@testing-library/react'
import { VideoUploadFormFields } from '../VideoUploadFormFields'

describe('VideoUploadFormFields', () => {
  const defaultProps = {
    title: '',
    description: '',
    externalId: '',
    isUploading: false,
    error: null,
    success: false,
    setTitle: jest.fn(),
    setDescription: jest.fn(),
    setExternalId: jest.fn(),
    handleFileChange: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should render form fields', () => {
    render(<VideoUploadFormFields {...defaultProps} />)
    
    expect(screen.getByLabelText(/videos.upload.fileLabel/)).toBeInTheDocument()
    expect(screen.getByLabelText(/videos.upload.titleLabel/)).toBeInTheDocument()
    expect(screen.getByLabelText(/videos.upload.descriptionLabel/)).toBeInTheDocument()
    expect(screen.getByLabelText(/videos.upload.externalIdLabel/)).toBeInTheDocument()
  })

  it('should call setTitle when title changes', () => {
    render(<VideoUploadFormFields {...defaultProps} />)
    
    const titleInput = screen.getByLabelText(/videos.upload.titleLabel/)
    fireEvent.change(titleInput, { target: { value: 'New Title' } })
    
    expect(defaultProps.setTitle).toHaveBeenCalledWith('New Title')
  })

  it('should call setDescription when description changes', () => {
    render(<VideoUploadFormFields {...defaultProps} />)
    
    const descriptionInput = screen.getByLabelText(/videos.upload.descriptionLabel/)
    fireEvent.change(descriptionInput, { target: { value: 'New Description' } })
    
    expect(defaultProps.setDescription).toHaveBeenCalledWith('New Description')
  })

  it('should call setExternalId when external_id changes', () => {
    render(<VideoUploadFormFields {...defaultProps} />)
    
    const externalIdInput = screen.getByLabelText(/videos.upload.externalIdLabel/)
    fireEvent.change(externalIdInput, { target: { value: 'ext-123' } })
    
    expect(defaultProps.setExternalId).toHaveBeenCalledWith('ext-123')
  })

  it('should call handleFileChange when file changes', () => {
    render(<VideoUploadFormFields {...defaultProps} />)
    
    const fileInput = screen.getByLabelText(/videos.upload.fileLabel/)
    const file = new File(['content'], 'test.mp4', { type: 'video/mp4' })
    fireEvent.change(fileInput, { target: { files: [file] } })
    
    expect(defaultProps.handleFileChange).toHaveBeenCalled()
  })

  it('should display error message', () => {
    render(<VideoUploadFormFields {...defaultProps} error="Upload failed" />)
    
    expect(screen.getByText('Upload failed')).toBeInTheDocument()
  })

  it('should display success message', () => {
    render(<VideoUploadFormFields {...defaultProps} success={true} />)
    
    expect(screen.getByText(/videos.upload.success/)).toBeInTheDocument()
  })

  it('should disable inputs when uploading', () => {
    render(<VideoUploadFormFields {...defaultProps} isUploading={true} />)
    
    const fileInput = screen.getByLabelText(/videos.upload.fileLabel/)
    const titleInput = screen.getByLabelText(/videos.upload.titleLabel/)
    const descriptionInput = screen.getByLabelText(/videos.upload.descriptionLabel/)
    const externalIdInput = screen.getByLabelText(/videos.upload.externalIdLabel/)
    
    expect(fileInput).toBeDisabled()
    expect(titleInput).toBeDisabled()
    expect(descriptionInput).toBeDisabled()
    expect(externalIdInput).toBeDisabled()
  })

  it('should show cancel button when showCancelButton is true', () => {
    const onCancel = jest.fn()
    render(
      <VideoUploadFormFields
        {...defaultProps}
        showCancelButton={true}
        onCancel={onCancel}
      />
    )
    
    expect(screen.getByText(/common.actions.cancel/)).toBeInTheDocument()
  })

  it('should call onCancel when cancel button is clicked', () => {
    const onCancel = jest.fn()
    render(
      <VideoUploadFormFields
        {...defaultProps}
        showCancelButton={true}
        onCancel={onCancel}
      />
    )
    
    const cancelButton = screen.getByText(/common.actions.cancel/)
    fireEvent.click(cancelButton)
    
    expect(onCancel).toHaveBeenCalled()
  })

  it('should hide buttons when hideButtons is true', () => {
    render(<VideoUploadFormFields {...defaultProps} hideButtons={true} />)
    
    expect(screen.queryByText(/videos.upload.upload/)).not.toBeInTheDocument()
  })
})

