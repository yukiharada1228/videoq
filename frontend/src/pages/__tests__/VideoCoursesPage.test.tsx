import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import VideoCoursesPage from '../VideoCoursesPage'
import { apiClient } from '@/lib/api'
import { useI18nNavigate } from '@/lib/i18n'

let mockNavigate: ReturnType<typeof vi.fn>

const mockCourses = [
  { id: 1, name: 'Course 1', description: 'Description 1', display_order: 0, created_at: '2024-01-01', video_count: 5 },
  { id: 2, name: 'Course 2', description: '', display_order: 1, created_at: '2024-01-02', video_count: 0 },
]

type MockGroup = (typeof mockCourses)[number]

const mockPaginatedGroups = (data: MockGroup[] = mockCourses) => ({
  data,
  meta: {
    total: data.length,
    limit: 24,
    offset: 0,
  },
})

vi.mock('@/lib/api', () => ({
  apiClient: {
    getMe: vi.fn(() => Promise.resolve({ id: '1', username: 'testuser', email: 'test@example.com' })),
    getVideoCourses: vi.fn(),
    getVideoCoursesPage: vi.fn(),
    createVideoCourse: vi.fn(),
    reorderVideoCourses: vi.fn(),
  },
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'testuser' },
    isLoading: false,
  }),
}))

describe('VideoCoursesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate = useI18nNavigate() as ReturnType<typeof vi.fn>
      ; (apiClient.getVideoCoursesPage as ReturnType<typeof vi.fn>).mockResolvedValue(mockPaginatedGroups())
      ; (apiClient.reorderVideoCourses as ReturnType<typeof vi.fn>).mockResolvedValue({ message: 'OK' })
  })

  afterEach(() => {
    globalThis.__setMockLanguage('en')
  })

  it('should render page title', async () => {
    render(<VideoCoursesPage />)

    await waitFor(() => {
      expect(screen.getByText('videos.courses.title')).toBeInTheDocument()
    })
  })

  it('should render create button', async () => {
    render(<VideoCoursesPage />)

    await waitFor(() => {
      expect(screen.getByText('videos.courses.create')).toBeInTheDocument()
    })
  })

  it('should load and display courses', async () => {
    render(<VideoCoursesPage />)

    await waitFor(() => {
      expect(screen.getByText('Course 1')).toBeInTheDocument()
      expect(screen.getByText('Course 2')).toBeInTheDocument()
    })
  })

  it('should display video count for each course', async () => {
    render(<VideoCoursesPage />)

    await waitFor(() => {
      expect(screen.getAllByText(/videos\.courses\.videoCount/).length).toBeGreaterThan(0)
    })
  })

  it('should display empty message when no courses', async () => {
    ; (apiClient.getVideoCoursesPage as ReturnType<typeof vi.fn>).mockResolvedValue(mockPaginatedGroups([]))

    render(<VideoCoursesPage />)

    await waitFor(() => {
      expect(screen.getByText('videos.courses.empty')).toBeInTheDocument()
    })
    expect(screen.getByText('videos.courses.emptyDescription')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'videos.goToLibrary' })).toHaveAttribute('href', '/videos')
  })

  it('should open create modal when create button is clicked', async () => {
    render(<VideoCoursesPage />)

    await waitFor(() => {
      expect(screen.getByText('videos.courses.create')).toBeInTheDocument()
    })

    const createButton = screen.getByText('videos.courses.create')
    fireEvent.click(createButton)

    expect(screen.getByText('videos.courses.createTitle')).toBeInTheDocument()
  })

  it('should show name and description inputs in create modal', async () => {
    render(<VideoCoursesPage />)

    await waitFor(() => {
      expect(screen.getByText('videos.courses.create')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('videos.courses.create'))

    expect(screen.getByText('videos.courses.nameLabel')).toBeInTheDocument()
    expect(screen.getByText('videos.courses.descriptionLabel')).toBeInTheDocument()
  })

  it('should call createVideoCourse on form submit', async () => {
    ; (apiClient.createVideoCourse as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 3 })

    render(<VideoCoursesPage />)

    await waitFor(() => {
      expect(screen.getByText('videos.courses.create')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('videos.courses.create'))

    const nameInput = screen.getByPlaceholderText('videos.courses.namePlaceholder')
    fireEvent.change(nameInput, { target: { value: 'New Course' } })

    const createSubmitButton = screen.getByText('common.actions.create')
    fireEvent.click(createSubmitButton)

    await waitFor(() => {
      expect(apiClient.createVideoCourse).toHaveBeenCalledWith({
        name: 'New Course',
        description: '',
      })
    })
  })

  it('should close create modal on cancel', async () => {
    render(<VideoCoursesPage />)

    await waitFor(() => {
      expect(screen.getByText('videos.courses.create')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('videos.courses.create'))
    expect(screen.getByText('videos.courses.createTitle')).toBeInTheDocument()

    fireEvent.click(screen.getByText('common.actions.cancel'))

    await waitFor(() => {
      expect(screen.queryByText('videos.courses.createTitle')).not.toBeInTheDocument()
    })
  })

  it('should show drag handles without entering reorder mode', async () => {
    render(<VideoCoursesPage />)

    await waitFor(() => {
      expect(screen.getByText('Course 1')).toBeInTheDocument()
      expect(screen.getByText('Course 2')).toBeInTheDocument()
    })

    expect(screen.queryByText('videos.courses.reorder')).not.toBeInTheDocument()
    expect(screen.getAllByLabelText('videos.courses.dragHandle')).toHaveLength(2)
  })

  it('should save reordered course order immediately', async () => {
    render(<VideoCoursesPage />)

    await waitFor(() => {
      expect(screen.getByText('Course 1')).toBeInTheDocument()
      expect(screen.getByText('Course 2')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('videos.courses.moveDown {"name":"Course 1"}'))

    await waitFor(() => {
      expect(apiClient.reorderVideoCourses).toHaveBeenCalledWith([2, 1])
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('separates joined courses and never includes them in owner reordering', async () => {
    ; (apiClient.getVideoCoursesPage as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockPaginatedGroups([
        { ...mockCourses[0], access_role: 'owner' },
        { ...mockCourses[1], access_role: 'owner' },
        {
          id: 3,
          name: 'Teacher Course',
          description: 'Joined class',
          display_order: 0,
          created_at: '2024-01-03',
          video_count: 2,
          access_role: 'member',
        },
      ] as never),
    )

    render(<VideoCoursesPage />)

    expect(await screen.findByText('Teacher Course')).toBeInTheDocument()
    expect(screen.getByText('videos.courses.joinedTitle')).toBeInTheDocument()
    expect(screen.getByText('videos.courses.memberBadge')).toBeInTheDocument()
    expect(screen.getAllByLabelText('videos.courses.dragHandle')).toHaveLength(2)

    fireEvent.click(screen.getByLabelText('videos.courses.moveDown {"name":"Course 1"}'))
    await waitFor(() => {
      expect(apiClient.reorderVideoCourses).toHaveBeenCalledWith([2, 1])
    })
  })


})

describe('VideoCoursesPage - Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should display error message on load failure', async () => {
    ; (apiClient.getVideoCoursesPage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Load failed'))

    render(<VideoCoursesPage />)

    await waitFor(() => {
      expect(screen.getByText('Load failed')).toBeInTheDocument()
    })
  })
})
