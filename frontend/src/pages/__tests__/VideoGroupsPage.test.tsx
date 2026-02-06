import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import VideoGroupsPage from '../VideoGroupsPage'
import { apiClient } from '@/lib/api'

const mockGroups = [
  { id: 1, name: 'Group 1', description: 'Description 1', video_count: 5 },
  { id: 2, name: 'Group 2', description: '', video_count: 0 },
]

vi.mock('@/lib/api', () => ({
  apiClient: {
    getVideoGroups: vi.fn(),
    createVideoGroup: vi.fn(),
  },
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'testuser' },
    loading: false,
  }),
}))

describe('VideoGroupsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(apiClient.getVideoGroups as ReturnType<typeof vi.fn>).mockResolvedValue(mockGroups)
  })

  it('should render page title', async () => {
    render(<VideoGroupsPage />)

    await waitFor(() => {
      expect(screen.getByText('videos.groups.title')).toBeInTheDocument()
    })
  })

  it('should render create button', async () => {
    render(<VideoGroupsPage />)

    await waitFor(() => {
      expect(screen.getByText('videos.groups.create')).toBeInTheDocument()
    })
  })

  it('should load and display groups', async () => {
    render(<VideoGroupsPage />)

    await waitFor(() => {
      expect(screen.getByText('Group 1')).toBeInTheDocument()
      expect(screen.getByText('Group 2')).toBeInTheDocument()
    })
  })

  it('should display video count for each group', async () => {
    render(<VideoGroupsPage />)

    await waitFor(() => {
      expect(screen.getByText(/videos\.groups\.videoCount/)).toBeInTheDocument()
    })
  })

  it('should display empty message when no groups', async () => {
    ;(apiClient.getVideoGroups as ReturnType<typeof vi.fn>).mockResolvedValue([])

    render(<VideoGroupsPage />)

    await waitFor(() => {
      expect(screen.getByText('videos.groups.empty')).toBeInTheDocument()
    })
  })

  it('should open create modal when create button is clicked', async () => {
    render(<VideoGroupsPage />)

    await waitFor(() => {
      expect(screen.getByText('videos.groups.create')).toBeInTheDocument()
    })

    const createButton = screen.getByText('videos.groups.create')
    fireEvent.click(createButton)

    expect(screen.getByText('videos.groups.createTitle')).toBeInTheDocument()
    expect(screen.getByText('videos.groups.createDescription')).toBeInTheDocument()
  })

  it('should show name and description inputs in create modal', async () => {
    render(<VideoGroupsPage />)

    await waitFor(() => {
      expect(screen.getByText('videos.groups.create')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('videos.groups.create'))

    expect(screen.getByText('videos.groups.nameLabel')).toBeInTheDocument()
    expect(screen.getByText('videos.groups.descriptionLabel')).toBeInTheDocument()
  })

  it('should call createVideoGroup on form submit', async () => {
    ;(apiClient.createVideoGroup as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 3 })

    render(<VideoGroupsPage />)

    await waitFor(() => {
      expect(screen.getByText('videos.groups.create')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('videos.groups.create'))

    const nameInput = screen.getByPlaceholderText('videos.groups.namePlaceholder')
    fireEvent.change(nameInput, { target: { value: 'New Group' } })

    const createSubmitButton = screen.getByText('common.actions.create')
    fireEvent.click(createSubmitButton)

    await waitFor(() => {
      expect(apiClient.createVideoGroup).toHaveBeenCalledWith({
        name: 'New Group',
        description: '',
      })
    })
  })

  it('should close create modal on cancel', async () => {
    render(<VideoGroupsPage />)

    await waitFor(() => {
      expect(screen.getByText('videos.groups.create')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('videos.groups.create'))
    expect(screen.getByText('videos.groups.createTitle')).toBeInTheDocument()

    fireEvent.click(screen.getByText('common.actions.cancel'))

    await waitFor(() => {
      expect(screen.queryByText('videos.groups.createTitle')).not.toBeInTheDocument()
    })
  })
})

describe('VideoGroupsPage - Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should display error message on load failure', async () => {
    ;(apiClient.getVideoGroups as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Load failed'))

    render(<VideoGroupsPage />)

    await waitFor(() => {
      expect(screen.getByText(/videos.groups.loadError/)).toBeInTheDocument()
    })
  })
})
