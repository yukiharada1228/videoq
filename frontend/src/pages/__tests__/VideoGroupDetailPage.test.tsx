import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import VideoGroupDetailPage from '../VideoGroupDetailPage'
import { apiClient } from '@/lib/api'

const mockGroup = {
  id: 1,
  name: 'Test Group',
  description: 'Test Description',
  share_slug: null,
  videos: [
    { id: 1, title: 'Video 1', description: 'Desc 1', status: 'completed', file: 'video1.mp4', source_type: 'uploaded', order: 0 },
    { id: 2, title: 'Video 2', description: 'Desc 2', status: 'processing', file: 'video2.mp4', source_type: 'uploaded', order: 1 },
  ],
}

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ id: '1' }),
  }
})

vi.mock('@/lib/api', () => ({
  apiClient: {
    getMe: vi.fn(() => Promise.resolve({ id: '1', username: 'testuser', email: 'test@example.com' })),
    getVideoGroup: vi.fn(),
    getVideos: vi.fn(),
    updateVideoGroup: vi.fn(),
    deleteVideoGroup: vi.fn(),
    addVideosToGroup: vi.fn(),
    removeVideoFromGroup: vi.fn(),
    reorderVideosInGroup: vi.fn(),
    createShareLink: vi.fn(),
    deleteShareLink: vi.fn(),
    getVideoUrl: vi.fn((url) => url),
  },
}))

vi.mock('@/hooks/useTags', () => ({
  useTags: () => ({
    tags: [],
  }),
}))

vi.mock('@/components/chat/ChatPanel', () => ({
  ChatPanel: () => <div data-testid="chat-panel">Chat Panel</div>,
}))

vi.mock('@/components/video/TagFilterPanel', () => ({
  TagFilterPanel: () => <div data-testid="tag-filter-panel" />,
}))

vi.mock('@/components/video/TagManagementModal', () => ({
  TagManagementModal: () => null,
}))

describe('VideoGroupDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
      ; (apiClient.getVideoGroup as ReturnType<typeof vi.fn>).mockResolvedValue(mockGroup)
      ; (apiClient.getVideos as ReturnType<typeof vi.fn>).mockResolvedValue([])
  })

  afterEach(() => {
    globalThis.__setMockLanguage('en')
  })

  it('should render group name', async () => {
    render(<VideoGroupDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Test Group')).toBeInTheDocument()
    })
  })

  it('should render group description in edit form', async () => {
    render(<VideoGroupDetailPage />)

    // Click edit button (icon-only, accessed via title)
    await waitFor(() => {
      expect(screen.getByTitle('videos.groupDetail.editTitle')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('videos.groupDetail.editTitle'))

    // Description should be in the edit textarea
    await waitFor(() => {
      const textarea = screen.getByDisplayValue('Test Description')
      expect(textarea).toBeInTheDocument()
    })
  })

  it('should render edit button', async () => {
    render(<VideoGroupDetailPage />)

    await waitFor(() => {
      expect(screen.getByTitle('videos.groupDetail.editTitle')).toBeInTheDocument()
    })
  })

  it('should render add videos button', async () => {
    render(<VideoGroupDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('videos.groupDetail.addVideoButton')).toBeInTheDocument()
    })
  })

  it('should render back to list button', async () => {
    render(<VideoGroupDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('videos.groupDetail.breadcrumbGroups')).toBeInTheDocument()
    })
  })

  it('should render delete button', async () => {
    render(<VideoGroupDetailPage />)

    await waitFor(() => {
      expect(screen.getByTitle('videos.groupDetail.delete')).toBeInTheDocument()
    })
  })

  it('should render video list', async () => {
    render(<VideoGroupDetailPage />)

    await waitFor(() => {
      expect(screen.getAllByText('Video 1').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Video 2').length).toBeGreaterThan(0)
    })
  })

  it('should render chat panel', async () => {
    render(<VideoGroupDetailPage />)

    await waitFor(() => {
      expect(screen.getAllByTestId('chat-panel').length).toBeGreaterThan(0)
    })
  })

  it('should enter edit mode when edit button is clicked', async () => {
    render(<VideoGroupDetailPage />)

    await waitFor(() => {
      expect(screen.getByTitle('videos.groupDetail.editTitle')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('videos.groupDetail.editTitle'))

    expect(screen.getAllByText('common.actions.save').length).toBeGreaterThan(0)
    expect(screen.getByText('common.actions.cancel')).toBeInTheDocument()
  })

  it('should show share section', async () => {
    render(<VideoGroupDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('videos.groupDetail.shareLinkLabel')).toBeInTheDocument()
    })
  })

  it('should show save share link button when no share slug', async () => {
    render(<VideoGroupDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('common.actions.save')).toBeInTheDocument()
    })
  })

  it('should not autoplay youtube video on initial render', async () => {
    const youtubeGroup = {
      ...mockGroup,
      videos: [
        {
          id: 1,
          title: 'Video 1',
          description: 'Desc 1',
          status: 'completed',
          file: null,
          source_type: 'youtube' as const,
          youtube_embed_url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
          order: 0,
        },
      ],
    }
    ; (apiClient.getVideoGroup as ReturnType<typeof vi.fn>).mockResolvedValue(youtubeGroup)

    const { container } = render(<VideoGroupDetailPage />)

    await waitFor(() => {
      const iframe = container.querySelector('iframe')
      expect(iframe).not.toBeNull()
      expect(iframe?.getAttribute('src')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
    })
  })

  it('sets english metadata', async () => {
    globalThis.__setMockLanguage('en')
    render(<VideoGroupDetailPage />)

    await waitFor(() => {
      expect(document.title).toBe('Test Group | VideoQ')
    })
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'Test Description'
    )
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://videoq.jp/videos/groups/1'
    )
  })

  it('switches metadata for japanese locale', async () => {
    globalThis.__setMockLanguage('ja')
    render(<VideoGroupDetailPage />)

    await waitFor(() => {
      expect(document.title).toBe('Test Group | VideoQ')
    })
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'Test Description'
    )
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://videoq.jp/ja/videos/groups/1'
    )
  })
})

describe('VideoGroupDetailPage - Share Link', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const groupWithShare = { ...mockGroup, share_slug: 'test-token-123' }
      ; (apiClient.getVideoGroup as ReturnType<typeof vi.fn>).mockResolvedValue(groupWithShare)
  })

  it('should show share link when token exists', async () => {
    render(<VideoGroupDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('videos.groupDetail.copyButton')).toBeInTheDocument()
      expect(screen.getByText('videos.groupDetail.disable')).toBeInTheDocument()
    })
  })
})

describe('VideoGroupDetailPage - Delete', () => {
  const originalConfirm = window.confirm
  let currentGroup = structuredClone(mockGroup)

  beforeEach(() => {
    vi.clearAllMocks()
    currentGroup = structuredClone(mockGroup)
      ; (apiClient.getVideoGroup as ReturnType<typeof vi.fn>).mockImplementation(() => Promise.resolve(structuredClone(currentGroup)))
      ; (apiClient.deleteVideoGroup as ReturnType<typeof vi.fn>).mockResolvedValue({})
      ; (apiClient.removeVideoFromGroup as ReturnType<typeof vi.fn>).mockImplementation(async (_groupId: number, videoId: number) => {
        currentGroup = {
          ...currentGroup,
          videos: currentGroup.videos.filter((video) => video.id !== videoId),
        }
      })
    window.confirm = vi.fn(() => true)
  })

  afterEach(() => {
    window.confirm = originalConfirm
  })

  it('should call deleteVideoGroup when delete is confirmed', async () => {
    render(<VideoGroupDetailPage />)

    await waitFor(() => {
      expect(screen.getByTitle('videos.groupDetail.delete')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('videos.groupDetail.delete'))

    await waitFor(() => {
      expect(apiClient.deleteVideoGroup).toHaveBeenCalledWith(1)
    })
  })

  it('should show a visible remove-from-group action for each video without hover-only classes', async () => {
    render(<VideoGroupDetailPage />)

    const removeButtons = await screen.findAllByRole('button', { name: 'videos.groupDetail.removeFromGroup' })

    expect(removeButtons).toHaveLength(2)
    removeButtons.forEach((button) => {
      expect(button).not.toHaveClass('opacity-0')
      expect(button).not.toHaveClass('group-hover:opacity-100')
      expect(button).toHaveTextContent('')
    })
  })

  it('should remove the video from the group list when removal is confirmed', async () => {
    render(<VideoGroupDetailPage />)

    const [firstRemoveButton] = await screen.findAllByRole('button', { name: 'videos.groupDetail.removeFromGroup' })
    fireEvent.click(firstRemoveButton)

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalledWith('videos.groupDetail.removeVideoConfirm')
      expect(apiClient.removeVideoFromGroup).toHaveBeenCalledWith(1, 1)
    })

    await waitFor(() => {
      expect(screen.queryAllByText('Video 1')).toHaveLength(0)
      expect(screen.getAllByText('Video 2').length).toBeGreaterThan(0)
    })
  })
})
