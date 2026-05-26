import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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

vi.mock('@/components/layout/AppNav', () => ({
  AppNav: () => <nav data-testid="app-nav" />,
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
      expect(screen.getByText('videos.groupDetail.add')).toBeInTheDocument()
    })
  })

  it('should not render breadcrumb text', async () => {
    render(<VideoGroupDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Test Group')).toBeInTheDocument()
    })

    expect(screen.queryByText('videos.groupDetail.breadcrumbGroups')).not.toBeInTheDocument()
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

  it('should not render a fixed sub-header below the nav', async () => {
    const { container } = render(<VideoGroupDetailPage />)
    await waitFor(() => {
      expect(screen.getByText('Test Group')).toBeInTheDocument()
    })
    const subHeader = container.querySelector('.fixed.top-16.z-40')
    expect(subHeader).toBeNull()
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


})

describe('VideoGroupDetailPage - Edit modal error', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(apiClient.getVideoGroup as ReturnType<typeof vi.fn>).mockResolvedValue(mockGroup)
    ;(apiClient.updateVideoGroup as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Update failed'),
    )
  })

  it('should clear update error when modal is reopened after cancel', async () => {
    render(<VideoGroupDetailPage />)

    // Open edit modal
    await waitFor(() => {
      expect(screen.getByTitle('videos.groupDetail.editTitle')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTitle('videos.groupDetail.editTitle'))

    const dialog = await screen.findByRole('dialog')

    // Try to save → error appears
    fireEvent.click(within(dialog).getByText('common.actions.save'))
    await waitFor(() => {
      expect(within(dialog).getByText('Update failed')).toBeInTheDocument()
    })

    // Cancel closes modal
    fireEvent.click(within(dialog).getByText('common.actions.cancel'))

    // Reopen → error should NOT be visible
    fireEvent.click(screen.getByTitle('videos.groupDetail.editTitle'))
    const dialog2 = await screen.findByRole('dialog')
    expect(within(dialog2).queryByText('Update failed')).not.toBeInTheDocument()
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

describe('VideoGroupDetailPage - Loading state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Never-resolving promise simulates initial loading
    ;(apiClient.getVideoGroup as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}))
  })

  it('should render AppNav during initial loading', async () => {
    render(<VideoGroupDetailPage />)
    expect(screen.getByTestId('app-nav')).toBeInTheDocument()
  })

  it('should show loading spinner in content area below nav (not full-screen overlay)', async () => {
    const { container } = render(<VideoGroupDetailPage />)
    // Must NOT be a standalone full-screen wrapper (old behavior without AppNav)
    const fullScreenWrapper = container.querySelector('.min-h-screen.flex.items-center.justify-center')
    expect(fullScreenWrapper).toBeNull()
    // Must be positioned below the nav with viewport-filling height
    const contentArea = container.querySelector('.mt-16.flex.items-center.justify-center')
    expect(contentArea).not.toBeNull()
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

  it('should show delete error when delete fails', async () => {
    ;(apiClient.deleteVideoGroup as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Delete failed'),
    )

    render(<VideoGroupDetailPage />)

    await waitFor(() => {
      expect(screen.getByTitle('videos.groupDetail.delete')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('videos.groupDetail.delete'))

    await waitFor(() => {
      expect(screen.getByText('Delete failed')).toBeInTheDocument()
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

  it('should reset autoVideoId when the auto-selected video is removed from the group', async () => {
    // After Video 1 (initially auto-selected) is removed, autoVideoId should
    // update to Video 2. Subsequent title queries confirm Video 2 is now tracked.
    render(<VideoGroupDetailPage />)

    // Wait for initial render with Video 1 auto-selected
    await screen.findAllByRole('button', { name: 'videos.groupDetail.removeFromGroup' })

    // Remove Video 1 (the auto-selected one)
    const [firstRemoveButton] = screen.getAllByRole('button', { name: 'videos.groupDetail.removeFromGroup' })
    fireEvent.click(firstRemoveButton)

    await waitFor(() => {
      expect(screen.queryAllByText('Video 1')).toHaveLength(0)
    })

    // Video 2 should now be shown in the list (and become the new auto-selected)
    expect(screen.getAllByText('Video 2').length).toBeGreaterThan(0)
  })

  it('should keep player on Video 2 after deleting Video 1 (auto-selected) and then receiving a reordered list [Video 3, Video 2]', async () => {
    // Regression: after deletion shifts autoVideoId to V2, a subsequent reorder
    // that puts V3 first must NOT override autoVideoId with V3.

    // Override to 3-video group for this test
    const video3 = { id: 3, title: 'Video 3', description: 'Desc 3', status: 'completed', file: 'video3.mp4', source_type: 'uploaded', order: 2 }
    currentGroup = { ...mockGroup, videos: [...mockGroup.videos, video3] }
    ;(apiClient.updateVideoGroup as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const { container } = render(<VideoGroupDetailPage />)

    // Wait for all 3 remove buttons (initial load with V1, V2, V3)
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'videos.groupDetail.removeFromGroup' })).toHaveLength(3)
    })

    // Step 1: Delete Video 1 (auto-selected)
    // removeVideoFromGroup mock mutates currentGroup → [V2, V3]
    // syncGroupDetail → invalidateQueries → refetch returns [V2, V3]
    // autoVideoId: V1 stale → resets to V2 (first in new list)
    const [firstRemoveButton] = screen.getAllByRole('button', { name: 'videos.groupDetail.removeFromGroup' })
    fireEvent.click(firstRemoveButton)

    await waitFor(() => {
      expect(screen.queryAllByText('Video 1')).toHaveLength(0)
    })

    // Step 2: Simulate an external reorder — V3 moves before V2
    // Override currentGroup so the next refetch returns [V3, V2]
    currentGroup = {
      ...currentGroup,
      videos: [
        { id: 3, title: 'Video 3', description: 'Desc 3', status: 'completed', file: 'video3.mp4', source_type: 'uploaded', order: 0 },
        { id: 2, title: 'Video 2', description: 'Desc 2', status: 'processing', file: 'video2.mp4', source_type: 'uploaded', order: 1 },
      ],
    }

    // Trigger a refetch by saving the edit modal (updateGroupMutation.onSuccess → syncGroupDetail)
    fireEvent.click(screen.getByTitle('videos.groupDetail.editTitle'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByText('common.actions.save'))

    // After re-render with [V3, V2]:
    //   autoVideoId is still V2 (V2 is in the list → no reset)
    //   selectedVideo → V2 (from autoVideoId)
    //   Player must show video2.mp4, NOT video3.mp4
    await waitFor(() => {
      const videoEl = container.querySelector('video')
      expect(videoEl?.getAttribute('src')).toBe('video2.mp4')
    })
  })
})
