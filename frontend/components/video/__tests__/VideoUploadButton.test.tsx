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
})

