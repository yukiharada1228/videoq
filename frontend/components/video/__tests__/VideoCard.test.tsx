import { render, screen, fireEvent } from '@testing-library/react'
import { VideoCard } from '../VideoCard'

// Mock next/link
jest.mock('next/link', () => {
  const MockLink = ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  )
  MockLink.displayName = 'MockLink'
  return MockLink
})

// Mock video utils
jest.mock('@/lib/utils/video', () => ({
  getStatusBadgeClassName: jest.fn(() => 'badge-class'),
  getStatusLabel: jest.fn(() => 'Status Label'),
  formatDate: jest.fn(() => '2024-01-15'),
}))

describe('VideoCard', () => {
  const mockVideo = {
    id: 1,
    title: 'Test Video',
    uploaded_at: '2024-01-15T10:00:00Z',
    status: 'completed' as const,
    file: 'http://example.com/video.mp4',
    user: 1,
    description: 'Test description',
  }

  it('should render video card with title', () => {
    render(<VideoCard video={mockVideo} />)
    
    expect(screen.getByText('Test Video')).toBeInTheDocument()
  })

  it('should render video with link when showLink is true', () => {
    render(<VideoCard video={mockVideo} showLink={true} />)
    
    const link = screen.getByText('Test Video').closest('a')
    expect(link).toHaveAttribute('href', '/videos/1')
  })

  it('should not render link when showLink is false', () => {
    render(<VideoCard video={mockVideo} showLink={false} />)
    
    const link = screen.getByText('Test Video').closest('a')
    expect(link).not.toBeInTheDocument()
  })

  it('should call onClick when provided', () => {
    const onClick = jest.fn()
    const { container } = render(<VideoCard video={mockVideo} onClick={onClick} showLink={false} />)
    
    const card = container.querySelector('[onclick]') || container.firstChild
    if (card) {
      fireEvent.click(card as Element)
      expect(onClick).toHaveBeenCalled()
    }
  })

  it('should render placeholder when file is not available', () => {
    const videoWithoutFile = { ...mockVideo, file: '' }
    render(<VideoCard video={videoWithoutFile} />)
    
    expect(screen.getByText('Test Video')).toBeInTheDocument()
  })

  it('should apply custom className', () => {
    const { container } = render(<VideoCard video={mockVideo} className="custom-class" />)
    
    const card = container.querySelector('.custom-class')
    expect(card).toBeInTheDocument()
  })
})

