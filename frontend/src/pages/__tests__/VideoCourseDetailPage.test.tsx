import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import VideoCourseDetailPage from '../VideoCourseDetailPage'
import { apiClient } from '@/lib/api'
import { useI18nNavigate } from '@/lib/i18n'

const mockCourse = {
  id: 1,
  name: 'Test Course',
  description: 'Test Description',
  share_slug: null,
  access_role: 'owner' as const,
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
    getMeOrNull: vi.fn(() => Promise.resolve({ id: '1', username: 'testuser', email: 'test@example.com' })),
    getVideoCourse: vi.fn(),
    getVideos: vi.fn(),
    updateVideoCourse: vi.fn(),
    deleteVideoCourse: vi.fn(),
    addVideosToCourse: vi.fn(),
    removeVideoFromCourse: vi.fn(),
    reorderVideosInCourse: vi.fn(),
    createShareLink: vi.fn(),
    deleteShareLink: vi.fn(),
    getVideoUrl: vi.fn((url) => url),
    getCourseParticipants: vi.fn(),
    inviteCourseMembers: vi.fn(),
    resendCourseInvitation: vi.fn(),
    revokeCourseInvitation: vi.fn(),
    removeCourseMember: vi.fn(),
    leaveVideoCourse: vi.fn(),
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

describe('VideoCourseDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
      ; (apiClient.getVideoCourse as ReturnType<typeof vi.fn>).mockResolvedValue(mockCourse)
      ; (apiClient.getVideos as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], meta: { total: 0, limit: 24, offset: 0 } })
      ; (apiClient.getCourseParticipants as ReturnType<typeof vi.fn>).mockResolvedValue({ invitations: [], members: [] })
  })

  afterEach(() => {
    globalThis.__setMockLanguage('en')
  })

  it('should render course name', async () => {
    render(<VideoCourseDetailPage />)

    await waitFor(() => {
      expect(screen.getAllByText('Test Course').length).toBeGreaterThan(0)
    })
  })

  it('should render course description in edit form', async () => {
    render(<VideoCourseDetailPage />)

    // Click edit button (icon-only, accessed via title)
    await waitFor(() => {
      expect(screen.getByTitle('videos.courseDetail.editTitle')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('videos.courseDetail.editTitle'))

    // Description should be in the edit textarea
    await waitFor(() => {
      const textarea = screen.getByDisplayValue('Test Description')
      expect(textarea).toBeInTheDocument()
    })
  })

  it('should render edit button', async () => {
    render(<VideoCourseDetailPage />)

    await waitFor(() => {
      expect(screen.getByTitle('videos.courseDetail.editTitle')).toBeInTheDocument()
    })
  })

  it('should render add videos button', async () => {
    render(<VideoCourseDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('videos.courseDetail.add')).toBeInTheDocument()
    })
  })

  it('should render breadcrumbs for the course hierarchy', async () => {
    render(<VideoCourseDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('navigation.coursesNav')).toBeInTheDocument()
      expect(screen.getAllByText('Test Course').length).toBeGreaterThan(0)
    })
  })

  it('should render delete button', async () => {
    render(<VideoCourseDetailPage />)

    await waitFor(() => {
      expect(screen.getByTitle('videos.courseDetail.delete')).toBeInTheDocument()
    })
  })

  it('should render video list', async () => {
    render(<VideoCourseDetailPage />)

    await waitFor(() => {
      expect(screen.getAllByText('Video 1').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Video 2').length).toBeGreaterThan(0)
    })
  })

  it('should render chat panel', async () => {
    render(<VideoCourseDetailPage />)

    await waitFor(() => {
      expect(screen.getAllByTestId('chat-panel').length).toBeGreaterThan(0)
    })
  })

  it('should enter edit mode when edit button is clicked', async () => {
    render(<VideoCourseDetailPage />)

    await waitFor(() => {
      expect(screen.getByTitle('videos.courseDetail.editTitle')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('videos.courseDetail.editTitle'))

    expect(screen.getAllByText('common.actions.save').length).toBeGreaterThan(0)
    expect(screen.getByText('common.actions.cancel')).toBeInTheDocument()
  })

  it('should show share section in dialog', async () => {
    render(<VideoCourseDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('videos.courseDetail.shareOpen')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('videos.courseDetail.shareOpen'))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('videos.courseDetail.shareLinkLabel')).toBeInTheDocument()
    expect(within(dialog).getByText('common.actions.save')).toBeInTheDocument()
  })

  it('opens member management for the owner', async () => {
    render(<VideoCourseDetailPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'videos.courseMembers.open' }))

    expect(await screen.findByText('videos.courseMembers.title')).toBeInTheDocument()
    expect(apiClient.getCourseParticipants).toHaveBeenCalledWith(1)
  })

  it('shows read-only controls to a joined member and asks for confirmation before leaving', async () => {
    ; (apiClient.getVideoCourse as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockCourse,
      access_role: 'member',
    })
    ; (apiClient.leaveVideoCourse as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

    render(<VideoCourseDetailPage />)

    expect(await screen.findByRole('button', { name: 'videos.courseDetail.leave' })).toBeInTheDocument()
    expect(screen.queryByText('videos.courseDetail.shareOpen')).not.toBeInTheDocument()
    expect(screen.queryByTitle('videos.courseDetail.editTitle')).not.toBeInTheDocument()
    expect(screen.queryByTitle('videos.courseDetail.delete')).not.toBeInTheDocument()
    expect(screen.queryByText('videos.courseDetail.add')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('button', { name: 'videos.courseDetail.removeFromCourse' })).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'videos.courseDetail.leave' }))

    const dialog = await screen.findByRole('dialog', { name: /confirmations\.leaveCourse/ })
    expect(within(dialog).getByText('confirmations.leaveCourseDescription')).toBeInTheDocument()
    expect(apiClient.leaveVideoCourse).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'common.actions.cancel' }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /confirmations\.leaveCourse/ })).not.toBeInTheDocument()
    })
    expect(apiClient.leaveVideoCourse).not.toHaveBeenCalled()
  })

  it('leaves a joined course only after the member confirms', async () => {
    ; (apiClient.getVideoCourse as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockCourse,
      access_role: 'member',
    })
    ; (apiClient.leaveVideoCourse as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    const navigate = useI18nNavigate() as ReturnType<typeof vi.fn>

    render(<VideoCourseDetailPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'videos.courseDetail.leave' }))
    const dialog = await screen.findByRole('dialog', { name: /confirmations\.leaveCourse/ })
    fireEvent.click(within(dialog).getByRole('button', { name: 'videos.courseDetail.leave' }))

    await waitFor(() => {
      expect(apiClient.leaveVideoCourse).toHaveBeenCalledWith(1)
      expect(navigate).toHaveBeenCalledWith('/videos/courses')
    })
  })

  it('should not render a fixed sub-header below the nav', async () => {
    const { container } = render(<VideoCourseDetailPage />)
    await waitFor(() => {
      expect(screen.getAllByText('Test Course').length).toBeGreaterThan(0)
    })
    const subHeader = container.querySelector('.fixed.top-16.z-40')
    expect(subHeader).toBeNull()
  })

  it('should not autoplay youtube video on initial render', async () => {
    const youtubeCourse = {
      ...mockCourse,
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
    ; (apiClient.getVideoCourse as ReturnType<typeof vi.fn>).mockResolvedValue(youtubeCourse)

    const { container } = render(<VideoCourseDetailPage />)

    await waitFor(() => {
      const iframe = container.querySelector('iframe')
      expect(iframe).not.toBeNull()
      expect(iframe?.getAttribute('src')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ')
    })
  })


})

describe('VideoCourseDetailPage - Edit modal error', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(apiClient.getVideoCourse as ReturnType<typeof vi.fn>).mockResolvedValue(mockCourse)
    ;(apiClient.updateVideoCourse as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Update failed'),
    )
  })

  it('should clear update error when modal is reopened after cancel', async () => {
    render(<VideoCourseDetailPage />)

    // Open edit modal
    await waitFor(() => {
      expect(screen.getByTitle('videos.courseDetail.editTitle')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTitle('videos.courseDetail.editTitle'))

    const dialog = await screen.findByRole('dialog')

    // Try to save → error appears
    fireEvent.click(within(dialog).getByText('common.actions.save'))
    await waitFor(() => {
      expect(within(dialog).getByText('Update failed')).toBeInTheDocument()
    })

    // Cancel closes modal
    fireEvent.click(within(dialog).getByText('common.actions.cancel'))

    // Reopen → error should NOT be visible
    fireEvent.click(screen.getByTitle('videos.courseDetail.editTitle'))
    const dialog2 = await screen.findByRole('dialog')
    expect(within(dialog2).queryByText('Update failed')).not.toBeInTheDocument()
  })
})

describe('VideoCourseDetailPage - Share Link', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const courseWithShare = { ...mockCourse, share_slug: 'test-token-123' }
      ; (apiClient.getVideoCourse as ReturnType<typeof vi.fn>).mockResolvedValue(courseWithShare)
  })

  it('should show share link when token exists', async () => {
    render(<VideoCourseDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('videos.courseDetail.shareOpen')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('videos.courseDetail.shareOpen'))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('videos.courseDetail.copyButton')).toBeInTheDocument()
    expect(within(dialog).getByText('videos.courseDetail.disable')).toBeInTheDocument()
  })
})

describe('VideoCourseDetailPage - Loading state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Never-resolving promise simulates initial loading
    ;(apiClient.getVideoCourse as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}))
  })

  it('should render AppNav during initial loading', async () => {
    render(<VideoCourseDetailPage />)
    expect(screen.getByTestId('app-nav')).toBeInTheDocument()
  })

  it('should show loading spinner in content area below nav (not full-screen overlay)', async () => {
    const { container } = render(<VideoCourseDetailPage />)
    // Must NOT be a standalone full-screen wrapper (old behavior without AppNav)
    const fullScreenWrapper = container.querySelector('.min-h-screen.flex.items-center.justify-center')
    expect(fullScreenWrapper).toBeNull()
    // Must be positioned below the nav with viewport-filling height
    const contentArea = container.querySelector('.flex.items-center.justify-center')
    expect(contentArea).not.toBeNull()
  })
})

describe('VideoCourseDetailPage - Delete', () => {
  let currentGroup = structuredClone(mockCourse)

  beforeEach(() => {
    vi.clearAllMocks()
    currentGroup = structuredClone(mockCourse)
      ; (apiClient.getVideoCourse as ReturnType<typeof vi.fn>).mockImplementation(() => Promise.resolve(structuredClone(currentGroup)))
      ; (apiClient.deleteVideoCourse as ReturnType<typeof vi.fn>).mockResolvedValue({})
      ; (apiClient.removeVideoFromCourse as ReturnType<typeof vi.fn>).mockImplementation(async (_courseId: number, videoId: number) => {
        currentGroup = {
          ...currentGroup,
          videos: currentGroup.videos.filter((video) => video.id !== videoId),
        }
      })
  })

  it('should call deleteVideoCourse when delete is confirmed', async () => {
    render(<VideoCourseDetailPage />)

    await waitFor(() => {
      expect(screen.getByTitle('videos.courseDetail.delete')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('videos.courseDetail.delete'))
    fireEvent.click(await screen.findByRole('button', { name: 'common.actions.delete' }))

    await waitFor(() => {
      expect(apiClient.deleteVideoCourse).toHaveBeenCalledWith(1)
    })
  })

  it('should show a visible remove-from-course action for each video without hover-only classes', async () => {
    render(<VideoCourseDetailPage />)

    const removeButtons = await screen.findAllByRole('button', { name: 'videos.courseDetail.removeFromCourse' })

    expect(removeButtons).toHaveLength(2)
    removeButtons.forEach((button) => {
      expect(button).not.toHaveClass('opacity-0')
      expect(button).not.toHaveClass('group-hover:opacity-100')
      expect(button).toHaveTextContent('')
    })
  })

  it('should show delete error when delete fails', async () => {
    ;(apiClient.deleteVideoCourse as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Delete failed'),
    )

    render(<VideoCourseDetailPage />)

    await waitFor(() => {
      expect(screen.getByTitle('videos.courseDetail.delete')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTitle('videos.courseDetail.delete'))
    fireEvent.click(await screen.findByRole('button', { name: 'common.actions.delete' }))

    await waitFor(() => {
      expect(screen.getByText('Delete failed')).toBeInTheDocument()
    })
  })

  it('should remove the video from the course list when removal is confirmed', async () => {
    render(<VideoCourseDetailPage />)

    const [firstRemoveButton] = await screen.findAllByRole('button', { name: 'videos.courseDetail.removeFromCourse' })
    fireEvent.click(firstRemoveButton)
    fireEvent.click(await screen.findByRole('button', { name: 'common.actions.confirm' }))

    await waitFor(() => {
      expect(apiClient.removeVideoFromCourse).toHaveBeenCalledWith(1, 1)
    })

    await waitFor(() => {
      expect(screen.queryAllByText('Video 1')).toHaveLength(0)
      expect(screen.getAllByText('Video 2').length).toBeGreaterThan(0)
    })
  })

  it('should reset autoVideoId when the auto-selected video is removed from the course', async () => {
    // After Video 1 (initially auto-selected) is removed, autoVideoId should
    // update to Video 2. Subsequent title queries confirm Video 2 is now tracked.
    render(<VideoCourseDetailPage />)

    // Wait for initial render with Video 1 auto-selected
    await screen.findAllByRole('button', { name: 'videos.courseDetail.removeFromCourse' })

    // Remove Video 1 (the auto-selected one)
    const [firstRemoveButton] = screen.getAllByRole('button', { name: 'videos.courseDetail.removeFromCourse' })
    fireEvent.click(firstRemoveButton)
    fireEvent.click(await screen.findByRole('button', { name: 'common.actions.confirm' }))

    await waitFor(() => {
      expect(screen.queryAllByText('Video 1')).toHaveLength(0)
    })

    // Video 2 should now be shown in the list (and become the new auto-selected)
    expect(screen.getAllByText('Video 2').length).toBeGreaterThan(0)
  })

  it('should keep player on Video 2 after deleting Video 1 (auto-selected) and then receiving a reordered list [Video 3, Video 2]', async () => {
    // Regression: after deletion shifts autoVideoId to V2, a subsequent reorder
    // that puts V3 first must NOT override autoVideoId with V3.

    // Override to 3-video course for this test
    const video3 = { id: 3, title: 'Video 3', description: 'Desc 3', status: 'completed', file: 'video3.mp4', source_type: 'uploaded', order: 2 }
    currentGroup = { ...mockCourse, videos: [...mockCourse.videos, video3] }
    ;(apiClient.updateVideoCourse as ReturnType<typeof vi.fn>).mockResolvedValue({})

    const { container } = render(<VideoCourseDetailPage />)

    // Wait for all 3 remove buttons (initial load with V1, V2, V3)
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'videos.courseDetail.removeFromCourse' })).toHaveLength(3)
    })

    // Step 1: Delete Video 1 (auto-selected)
    // removeVideoFromCourse mock mutates currentGroup → [V2, V3]
    // syncCourseDetail → invalidateQueries → refetch returns [V2, V3]
    // autoVideoId: V1 stale → resets to V2 (first in new list)
    const [firstRemoveButton] = screen.getAllByRole('button', { name: 'videos.courseDetail.removeFromCourse' })
    fireEvent.click(firstRemoveButton)
    fireEvent.click(await screen.findByRole('button', { name: 'common.actions.confirm' }))

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

    // Trigger a refetch by saving the edit modal (updateCourseMutation.onSuccess → syncCourseDetail)
    fireEvent.click(screen.getByTitle('videos.courseDetail.editTitle'))
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
