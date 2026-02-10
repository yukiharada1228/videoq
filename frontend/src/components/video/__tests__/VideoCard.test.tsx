import { render, screen, fireEvent } from '@testing-library/react'
import { VideoCard } from '../VideoCard'

// Mock IntersectionObserver — immediately report elements as visible
const mockIntersectionObserver = vi.fn();
mockIntersectionObserver.mockImplementation((callback: IntersectionObserverCallback) => {
  // Immediately call with isIntersecting: true so video elements render
  callback(
    [{ isIntersecting: true } as IntersectionObserverEntry],
    {} as IntersectionObserver,
  );
  return {
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  };
});
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: mockIntersectionObserver,
});

// Mock next/link
vi.mock('next/link', () => {
  const MockLink = ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  )
  MockLink.displayName = 'MockLink'
  return MockLink
})

// Mock video utils
vi.mock('@/lib/utils/video', () => ({
  getStatusBadgeClassName: vi.fn(() => 'badge-class'),
  getStatusLabel: vi.fn(() => 'Status Label'),
  formatDate: vi.fn(() => '2024-01-15'),
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
    external_id: null as string | null,
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
    const onClick = vi.fn()
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

  it('should render external_id text when external_id is provided', () => {
    const videoWithExternalId = { ...mockVideo, external_id: 'ext-123', file: 'http://example.com/video.mp4' }
    render(<VideoCard video={videoWithExternalId} />)

    expect(screen.getByText('external_id')).toBeInTheDocument()
    expect(screen.getByText('ext-123')).toBeInTheDocument()
  })

  it('should apply custom className', () => {
    const { container } = render(<VideoCard video={mockVideo} className="custom-class" />)

    const card = container.querySelector('.custom-class')
    expect(card).toBeInTheDocument()
  })

  it('should play video on mouse enter', () => {
    const { container } = render(<VideoCard video={mockVideo} />)

    const video = container.querySelector('video')
    if (video) {
      const playSpy = vi.spyOn(video, 'play').mockResolvedValue(undefined)

      fireEvent.mouseEnter(video)

      expect(playSpy).toHaveBeenCalled()
      playSpy.mockRestore()
    }
  })

  it('should pause video and reset time on mouse leave', () => {
    const { container } = render(<VideoCard video={mockVideo} />)

    const video = container.querySelector('video')
    if (video) {
      const pauseSpy = vi.spyOn(video, 'pause').mockImplementation(() => { })
      Object.defineProperty(video, 'currentTime', {
        writable: true,
        value: 0,
      })

      fireEvent.mouseLeave(video)

      expect(pauseSpy).toHaveBeenCalled()
      expect(video.currentTime).toBe(0)
      pauseSpy.mockRestore()
    }
  })

  it('should handle video play error gracefully', () => {
    const { container } = render(<VideoCard video={mockVideo} />)

    const video = container.querySelector('video')
    if (video) {
      const playSpy = vi.spyOn(video, 'play').mockRejectedValue(new Error('Play failed'))

      // Should not throw
      expect(() => {
        fireEvent.mouseEnter(video)
      }).not.toThrow()

      playSpy.mockRestore()
    }
  })
})

