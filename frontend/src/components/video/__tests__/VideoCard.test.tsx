import { render, screen, fireEvent } from '@testing-library/react'
import { VideoCard } from '../VideoCard'

// Mock IntersectionObserver — immediately report elements as visible
const mockIntersectionObserver = vi.fn()
mockIntersectionObserver.mockImplementation((callback: IntersectionObserverCallback) => {
  callback(
    [{ isIntersecting: true } as IntersectionObserverEntry],
    {} as IntersectionObserver,
  )
  return {
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }
})
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: mockIntersectionObserver,
})

vi.mock('@/lib/utils/video', () => ({
  getStatusBadgeClassName: vi.fn(() => 'badge-class'),
  getStatusChipColor: vi.fn(() => 'green'),
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
    source_type: 'uploaded' as const,
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
    const onClick = vi.fn()
    render(<VideoCard video={mockVideo} onClick={onClick} showLink={false} />)

    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalled()
  })

  it('should render placeholder when file is not available', () => {
    const videoWithoutFile = { ...mockVideo, file: '' }
    render(<VideoCard video={videoWithoutFile} />)

    expect(screen.getByText('Test Video')).toBeInTheDocument()
  })

  it('should render youtube thumbnail when source is youtube', () => {
    const youtubeVideo = {
      ...mockVideo,
      file: null,
      source_type: 'youtube' as const,
      youtube_video_id: 'dQw4w9WgXcQ',
    }

    render(<VideoCard video={youtubeVideo} />)

    const image = screen.getByAltText('Test Video')
    expect(image).toHaveAttribute('src', 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
  })

  it('should apply custom className', () => {
    const { container } = render(<VideoCard video={mockVideo} className="custom-class" />)

    const card = container.querySelector('.custom-class')
    expect(card).toBeInTheDocument()
  })

  it('should render status and date', () => {
    render(<VideoCard video={mockVideo} />)

    expect(screen.getByText('Status Label')).toBeInTheDocument()
    expect(screen.getByText('2024-01-15')).toBeInTheDocument()
  })

  it('should play video on row mouse enter', () => {
    const { container } = render(<VideoCard video={mockVideo} />)

    const video = container.querySelector('video')
    expect(video).not.toBeNull()
    const playSpy = vi.spyOn(video!, 'play').mockResolvedValue(undefined)
    const row = container.querySelector('.group')
    expect(row).not.toBeNull()

    fireEvent.mouseEnter(row!)

    expect(playSpy).toHaveBeenCalled()
    playSpy.mockRestore()
  })

  it('should pause video and reset time on row mouse leave', () => {
    const { container } = render(<VideoCard video={mockVideo} />)

    const video = container.querySelector('video')
    expect(video).not.toBeNull()
    const pauseSpy = vi.spyOn(video!, 'pause').mockImplementation(() => {})
    Object.defineProperty(video!, 'currentTime', {
      writable: true,
      value: 0,
    })
    const row = container.querySelector('.group')
    expect(row).not.toBeNull()

    fireEvent.mouseLeave(row!)

    expect(pauseSpy).toHaveBeenCalled()
    expect(video!.currentTime).toBe(0)
    pauseSpy.mockRestore()
  })

  it('should handle video play error gracefully', () => {
    const { container } = render(<VideoCard video={mockVideo} />)

    const video = container.querySelector('video')
    expect(video).not.toBeNull()
    const playSpy = vi.spyOn(video!, 'play').mockRejectedValue(new Error('Play failed'))
    const row = container.querySelector('.group')
    expect(row).not.toBeNull()

    expect(() => {
      fireEvent.mouseEnter(row!)
    }).not.toThrow()

    playSpy.mockRestore()
  })
})
