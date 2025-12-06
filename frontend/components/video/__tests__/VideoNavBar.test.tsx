import { render, screen, fireEvent } from '@testing-library/react'
import { VideoNavBar } from '../VideoNavBar'

// Mock @/i18n/routing
const mockPush = jest.fn()
jest.mock('@/i18n/routing', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

describe('VideoNavBar', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should render navigation buttons', () => {
    const onUploadClick = jest.fn()
    render(<VideoNavBar onUploadClick={onUploadClick} />)
    
    expect(screen.getByText(/common.actions.backToHome/)).toBeInTheDocument()
    expect(screen.getByText(/videos.list.uploadButton/)).toBeInTheDocument()
  })

  it('should call onUploadClick when upload button is clicked', () => {
    const onUploadClick = jest.fn()
    render(<VideoNavBar onUploadClick={onUploadClick} />)
    
    const uploadButton = screen.getByText(/videos.list.uploadButton/)
    fireEvent.click(uploadButton)
    
    expect(onUploadClick).toHaveBeenCalled()
  })

  it('should navigate to home when back button is clicked', () => {
    const onUploadClick = jest.fn()
    render(<VideoNavBar onUploadClick={onUploadClick} />)
    
    const backButton = screen.getByText(/common.actions.backToHome/)
    fireEvent.click(backButton)
    
    expect(mockPush).toHaveBeenCalledWith('/')
  })
})

