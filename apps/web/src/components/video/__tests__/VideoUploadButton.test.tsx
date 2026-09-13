import { render, screen } from '@testing-library/react'
import { VideoUploadButton } from '../VideoUploadButton'

describe('VideoUploadButton', () => {
  it('should render upload button', () => {
    render(<VideoUploadButton isUploading={false} />)
    
    expect(screen.getByText(/videos.upload.upload/)).toBeInTheDocument()
  })

  it('should render uploading state', () => {
    render(<VideoUploadButton isUploading={true} />)
    
    expect(screen.getByText(/videos.upload.uploading/)).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('should apply fullWidth className when fullWidth is true', () => {
    render(<VideoUploadButton isUploading={false} fullWidth={true} />)
    
    const button = screen.getByRole('button')
    expect(button.className).toContain('w-full')
  })

  it('should apply custom className', () => {
    render(<VideoUploadButton isUploading={false} className="custom-class" />)
    
    const button = screen.getByRole('button')
    expect(button.className).toContain('custom-class')
  })

  it('should use outline variant', () => {
    render(<VideoUploadButton isUploading={false} variant="outline" />)

    const button = screen.getByRole('button')
    expect(button).toBeInTheDocument()
  })

  it('should include the progress percentage in the uploading label once known', () => {
    render(<VideoUploadButton isUploading={true} progress={42} />)

    const button = screen.getByRole('button')
    expect(button.textContent).toContain('uploadingWithProgress')
    expect(button.textContent).toContain('42')
  })

  it('should fall back to the plain uploading label when progress is not yet known', () => {
    render(<VideoUploadButton isUploading={true} progress={0} />)

    const button = screen.getByRole('button')
    expect(button.textContent).not.toContain('uploadingWithProgress')
  })

  it('should fall back to the plain uploading label when progress is omitted', () => {
    render(<VideoUploadButton isUploading={true} />)

    const button = screen.getByRole('button')
    expect(button.textContent).not.toContain('uploadingWithProgress')
  })
})

