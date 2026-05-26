import { render, screen, waitFor } from '@testing-library/react'
import VideoGroupDetailPage from '../VideoGroupDetailPage'
import { useVideoGroupDetailQuery } from '@/hooks/useVideoGroupDetailData'

const mockGroup = {
  id: 1,
  name: 'Test Group',
  description: 'Test Description',
  share_slug: null,
  videos: [],
}

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ id: '1' }),
  }
})

vi.mock('@/hooks/useVideoGroupDetailData', async (importActual) => {
  const actual = await importActual<typeof import('@/hooks/useVideoGroupDetailData')>()
  return {
    ...actual,
    useVideoGroupDetailQuery: vi.fn(),
  }
})

vi.mock('@/hooks/useTags', () => ({
  useTags: () => ({ tags: [] }),
}))

vi.mock('@/components/chat/ChatPanel', () => ({
  ChatPanel: () => null,
}))

vi.mock('@/components/video/TagFilterPanel', () => ({
  TagFilterPanel: () => null,
}))

vi.mock('@/components/video/TagManagementModal', () => ({
  TagManagementModal: () => null,
}))

describe('VideoGroupDetailPage - background refetch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.__setMockLanguage('en')
  })

  it('should show content (not full-screen spinner) when isFetching=true but isLoading=false', async () => {
    // Simulate background refetch: cached data available but fetch in progress
    ;(useVideoGroupDetailQuery as ReturnType<typeof vi.fn>).mockReturnValue({
      group: mockGroup,
      isLoading: false,
      isFetching: true,
      errorMessage: null,
    })

    render(<VideoGroupDetailPage />)

    // Group name should be visible — content preserved, no full-screen spinner
    await waitFor(() => {
      expect(screen.getByText('Test Group')).toBeInTheDocument()
    })
  })
})
