import { render, screen } from '@testing-library/react'
import { VideoList } from '../VideoList'

// Mock VideoCard
jest.mock('../VideoCard', () => ({
  VideoCard: ({ video }: { video: { id: number; title: string } }) => (
    <div data-testid={`video-card-${video.id}`}>{video.title}</div>
  ),
}))

describe('VideoList', () => {
  const mockVideos = [
    {
      id: 1,
      title: 'Video 1',
      uploaded_at: '2024-01-15T10:00:00Z',
      status: 'completed' as const,
      file: 'http://example.com/video1.mp4',
      user: 1,
      description: 'Description 1',
    },
    {
      id: 2,
      title: 'Video 2',
      uploaded_at: '2024-01-16T10:00:00Z',
      status: 'processing' as const,
      file: 'http://example.com/video2.mp4',
      user: 1,
      description: 'Description 2',
    },
  ]

  it('should render list of videos', () => {
    render(<VideoList videos={mockVideos} />)
    
    expect(screen.getByTestId('video-card-1')).toBeInTheDocument()
    expect(screen.getByTestId('video-card-2')).toBeInTheDocument()
  })

  it('should render empty state when no videos', () => {
    render(<VideoList videos={[]} />)
    
    expect(screen.getByText('videos.list.noVideos')).toBeInTheDocument()
    expect(screen.getByText('videos.list.noVideosHint')).toBeInTheDocument()
  })

  it('should render correct number of video cards', () => {
    render(<VideoList videos={mockVideos} />)
    
    const cards = screen.getAllByTestId(/video-card-/)
    expect(cards).toHaveLength(2)
  })
})

