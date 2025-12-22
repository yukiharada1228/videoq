import { render, screen, fireEvent } from '@testing-library/react'
import { VideoNavBar } from '../VideoNavBar'
import { useI18nNavigate } from '@/lib/i18n'

describe('VideoNavBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as any).__setMockPathname?.('/')
    window.history.pushState({}, '', '/')
  })

  it('should render navigation buttons', () => {
    const onUploadClick = vi.fn()
    render(<VideoNavBar onUploadClick={onUploadClick} />)
    
    expect(screen.getByText(/common.actions.backToHome/)).toBeInTheDocument()
    expect(screen.getByText(/videos.list.uploadButton/)).toBeInTheDocument()
  })

  it('should call onUploadClick when upload button is clicked', () => {
    const onUploadClick = vi.fn()
    render(<VideoNavBar onUploadClick={onUploadClick} />)
    
    const uploadButton = screen.getByText(/videos.list.uploadButton/)
    fireEvent.click(uploadButton)
    
    expect(onUploadClick).toHaveBeenCalled()
  })

  it('should navigate to home when back button is clicked', () => {
    const onUploadClick = vi.fn()
    render(<VideoNavBar onUploadClick={onUploadClick} />)
    
    const backButton = screen.getByText(/common.actions.backToHome/)
    fireEvent.click(backButton)
    
    const navigate = useI18nNavigate()
    expect(navigate).toHaveBeenCalledWith('/')
  })
})

