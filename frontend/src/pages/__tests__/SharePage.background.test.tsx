import { render, screen, waitFor } from '@testing-library/react'
import SharePage from '../SharePage'
import { useSharedGroupQuery } from '@/hooks/useSharePageData'

const mockGroup = {
  id: 1,
  name: 'Shared Group',
  description: 'Shared Description',
  videos: [
    { id: 1, title: 'Shared Video 1', description: '', status: 'completed', file: 'video1.mp4', source_type: 'uploaded' as const, order: 0 },
  ],
}

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ token: 'test-share-token' }),
  }
})

vi.mock('@/hooks/useSharePageData', () => ({
  useSharedGroupQuery: vi.fn(),
}))

vi.mock('@/components/chat/ChatPanel', () => ({
  ChatPanel: () => null,
}))

describe('SharePage - background refetch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.__setMockLanguage('en')
  })

  it('should show content (not full-screen spinner) when isFetching=true but isLoading=false', async () => {
    // Simulate background refetch: cached data available but fetch in progress
    ;(useSharedGroupQuery as ReturnType<typeof vi.fn>).mockReturnValue({
      data: mockGroup,
      isLoading: false,
      isFetching: true,
      error: null,
    })

    render(<SharePage />)

    // Content should be visible — not replaced by full-screen spinner
    await waitFor(() => {
      expect(screen.getByText('Shared Group')).toBeInTheDocument()
    })
  })
})
