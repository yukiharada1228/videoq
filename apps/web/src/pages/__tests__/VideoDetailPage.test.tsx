import { act, render, renderHook, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryObserver, useQueryClient } from '@tanstack/react-query'
import VideoDetailPage from '../VideoDetailPage'
import { ApiError } from '@/lib/api'
import { trpc } from '@/lib/trpc'

const videoTrpcMocks = vi.hoisted(() => ({
  update: vi.fn(),
  delete: vi.fn(),
  addTags: vi.fn(),
  removeTag: vi.fn(),
}))

const mockVideo = {
  id: 1,
  title: 'Test Video',
  description: 'Test Description',
  status: 'completed',
  file: 'test.mp4',
  source_type: 'uploaded',
  uploaded_at: '2024-01-01T00:00:00Z',
  transcript: '1\n00:00:00,000 --> 00:00:05,000\nHello world',
  tags: [{ id: 1, name: 'Tag1', color: 'red' }],
  error_message: '',
}

let mockUseVideoReturn = {
  video: mockVideo as typeof mockVideo | null,
  isLoading: false,
  error: null as string | null,
}

let mockSearchParams = new URLSearchParams()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ id: '1' }),
    useSearchParams: () => [mockSearchParams, vi.fn()],
  }
})

vi.mock('@/hooks/useVideos', () => ({
  useVideo: () => mockUseVideoReturn,
}))

vi.mock('@/hooks/useTags', () => ({
  useTags: () => ({
    tags: [{ id: 1, name: 'Tag1', color: 'red' }],
    createTag: vi.fn(),
  }),
}))

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    apiClient: {
      getVideoUrl: vi.fn((url: string) => url),
    },
  }
})

beforeEach(() => {
  mockSearchParams = new URLSearchParams()
  globalThis.__setTrpcHandler('videos.update', videoTrpcMocks.update)
  globalThis.__setTrpcHandler('videos.delete', videoTrpcMocks.delete)
  globalThis.__setTrpcHandler('memberships.addTags', videoTrpcMocks.addTags)
  globalThis.__setTrpcHandler('memberships.removeTag', videoTrpcMocks.removeTag)
})

describe('VideoDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseVideoReturn = { video: mockVideo, isLoading: false, error: null }
  })

  afterEach(() => {
    globalThis.__setMockLanguage('en')
  })

  it('should render video title', () => {
    render(<VideoDetailPage />)

    expect(screen.getAllByText('Test Video').length).toBeGreaterThan(0)
  })

  it('should render video description', () => {
    render(<VideoDetailPage />)

    expect(screen.getByText('Test Description')).toBeInTheDocument()
  })

  it('should render video status', () => {
    render(<VideoDetailPage />)

    expect(screen.getByText('videos.detail.statusSection')).toBeInTheDocument()
    expect(screen.getByText('common.status.completed')).toBeInTheDocument()
  })

  it('should render edit button', () => {
    render(<VideoDetailPage />)

    expect(screen.getByText('videos.detail.editButton')).toBeInTheDocument()
  })

  it('should render delete button', () => {
    render(<VideoDetailPage />)

    expect(screen.getByText('videos.detail.deleteButton')).toBeInTheDocument()
  })

  it('should not render breadcrumb text', () => {
    render(<VideoDetailPage />)

    expect(screen.queryByText('videos.detail.videosBreadcrumb')).not.toBeInTheDocument()
  })

  it('should render transcript when available', () => {
    render(<VideoDetailPage />)

    expect(screen.getByText('videos.detail.transcriptSection')).toBeInTheDocument()
    expect(screen.getByText(/Hello world/)).toBeInTheDocument()
  })

  it('should open edit modal when edit button is clicked', () => {
    render(<VideoDetailPage />)

    fireEvent.click(screen.getByText('videos.detail.editButton'))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('common.actions.save')).toBeInTheDocument()
    expect(screen.getByText('common.actions.cancel')).toBeInTheDocument()
  })

  it('should not replace info card with inline form when edit button is clicked', () => {
    render(<VideoDetailPage />)

    fireEvent.click(screen.getByText('videos.detail.editButton'))

    // Info card should still be visible (title appears in card + in modal dialog)
    expect(screen.getAllByText('Test Video').length).toBeGreaterThan(0)
    // The dialog should be open
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('should not render a fixed sub-header below the nav', () => {
    const { container } = render(<VideoDetailPage />)
    const subHeader = container.querySelector('.fixed.top-16.z-40')
    expect(subHeader).toBeNull()
  })

})

describe('VideoDetailPage - Edit modal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseVideoReturn = { video: mockVideo, isLoading: false, error: null }
  })

  it.each(['metadata', 'transcript'] as const)('uses saved video detail and refreshes only affected lists after saving %s', async field => {
    const saved = { ...mockVideo, ...(field === 'metadata' ? { title: 'Updated Video' } : { transcript: `${mockVideo.transcript} updated` }) }
    videoTrpcMocks.update.mockResolvedValue(saved)
    const { result } = renderHook(() => useQueryClient())
    const keys = [
      trpc.videos.get.queryKey({ id: mockVideo.id }),
      trpc.videos.list.queryKey({ limit: 24 }),
      trpc.courses.get.queryKey({ id: 2 }),
    ]
    const fetches = keys.map(() => vi.fn(async () => ({ cached: true })))
    const unsubscribes = keys.map((queryKey, index) => {
      result.current.setQueryData(queryKey, { cached: true })
      return new QueryObserver(result.current, {
        queryKey,
        queryFn: fetches[index],
        staleTime: Infinity,
      }).subscribe(() => {})
    })
    try {
      render(<VideoDetailPage />)
      if (field === 'metadata') {
        fireEvent.click(screen.getByText('videos.detail.editButton'))
        fireEvent.change(screen.getByDisplayValue('Test Video'), { target: { value: saved.title } })
        fireEvent.click(screen.getByText('common.actions.save'))
      } else {
        fireEvent.click(screen.getByText('videos.detail.editTranscriptButton'))
        fireEvent.change(screen.getByRole('textbox'), { target: { value: saved.transcript } })
        fireEvent.click(screen.getByText('videos.detail.saveTranscriptButton'))
        await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument())
      }

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      await waitFor(() => expect(result.current.isMutating()).toBe(0))
      expect(videoTrpcMocks.update).toHaveBeenCalledTimes(1)
      expect(result.current.getQueryData(keys[0])).toEqual(saved)
      expect(fetches[0]).not.toHaveBeenCalled()
      for (const fetch of fetches.slice(1)) expect(fetch).toHaveBeenCalledTimes(field === 'metadata' ? 1 : 0)
    } finally {
      unsubscribes.forEach(unsubscribe => unsubscribe())
    }
  })

  it('should show update error in modal when save fails', async () => {
    videoTrpcMocks.update.mockRejectedValue(
      new Error('Update failed'),
    )

    render(<VideoDetailPage />)

    fireEvent.click(screen.getByText('videos.detail.editButton'))
    fireEvent.change(screen.getByDisplayValue('Test Video'), { target: { value: 'Updated Video' } })
    fireEvent.click(screen.getByText('common.actions.save'))

    await waitFor(() => {
      expect(screen.getByText('Update failed')).toBeInTheDocument()
    })
  })

  it('should close modal on cancel', async () => {
    videoTrpcMocks.update.mockRejectedValue(
      new Error('Update failed'),
    )

    render(<VideoDetailPage />)

    fireEvent.click(screen.getByText('videos.detail.editButton'))
    fireEvent.change(screen.getByDisplayValue('Test Video'), { target: { value: 'Updated Video' } })
    fireEvent.click(screen.getByText('common.actions.save'))

    await waitFor(() => {
      expect(screen.getByText('Update failed')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('common.actions.cancel'))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('should clear error when modal is reopened after cancel', async () => {
    videoTrpcMocks.update.mockRejectedValue(
      new Error('Update failed'),
    )

    render(<VideoDetailPage />)

    // Open → save → error appears
    fireEvent.click(screen.getByText('videos.detail.editButton'))
    fireEvent.change(screen.getByDisplayValue('Test Video'), { target: { value: 'Updated Video' } })
    fireEvent.click(screen.getByText('common.actions.save'))
    await waitFor(() => {
      expect(screen.getByText('Update failed')).toBeInTheDocument()
    })

    // Cancel closes modal
    fireEvent.click(screen.getByText('common.actions.cancel'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Reopen → error should NOT be visible
    fireEvent.click(screen.getByText('videos.detail.editButton'))
    expect(screen.queryByText('Update failed')).not.toBeInTheDocument()
  })
})

describe('VideoDetailPage - Delete error', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseVideoReturn = { video: mockVideo, isLoading: false, error: null }
  })

  it('should show delete error when delete fails', async () => {
    videoTrpcMocks.delete.mockRejectedValue(
      new Error('Delete failed'),
    )

    render(<VideoDetailPage />)

    fireEvent.click(screen.getByText('videos.detail.deleteButton'))
    fireEvent.click(await screen.findByRole('button', { name: 'common.actions.delete' }))

    await waitFor(() => {
      expect(screen.getByText('Delete failed')).toBeInTheDocument()
    })
  })
})

describe('VideoDetailPage - Transcript save error', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseVideoReturn = { video: mockVideo, isLoading: false, error: null }
  })

  it('should show error message when transcript save returns API error', async () => {
    videoTrpcMocks.update.mockRejectedValue(
      new ApiError('Transcript must be in valid SRT format.', 'INVALID_SRT_FORMAT'),
    )

    render(<VideoDetailPage />)

    fireEvent.click(screen.getByText('videos.detail.editTranscriptButton'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Invalid transcript' } })
    fireEvent.click(screen.getByText('videos.detail.saveTranscriptButton'))

    await waitFor(() => {
      expect(screen.getByText('Transcript must be in valid SRT format.')).toBeInTheDocument()
    })
  })

  it('should clear error message when transcript editing is cancelled', async () => {
    videoTrpcMocks.update.mockRejectedValue(
      new ApiError('Transcript must be in valid SRT format.', 'INVALID_SRT_FORMAT'),
    )

    render(<VideoDetailPage />)

    fireEvent.click(screen.getByText('videos.detail.editTranscriptButton'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Invalid transcript' } })
    fireEvent.click(screen.getByText('videos.detail.saveTranscriptButton'))

    await waitFor(() => {
      expect(screen.getByText('Transcript must be in valid SRT format.')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('videos.detail.cancel'))

    expect(screen.queryByText('Transcript must be in valid SRT format.')).not.toBeInTheDocument()
  })

  it('should clear error message when transcript editing is restarted', async () => {
    videoTrpcMocks.update.mockRejectedValue(
      new ApiError('Transcript must be in valid SRT format.', 'INVALID_SRT_FORMAT'),
    )

    render(<VideoDetailPage />)

    fireEvent.click(screen.getByText('videos.detail.editTranscriptButton'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Invalid transcript' } })
    fireEvent.click(screen.getByText('videos.detail.saveTranscriptButton'))

    await waitFor(() => {
      expect(screen.getByText('Transcript must be in valid SRT format.')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('videos.detail.cancel'))
    fireEvent.click(screen.getByText('videos.detail.editTranscriptButton'))

    expect(screen.queryByText('Transcript must be in valid SRT format.')).not.toBeInTheDocument()
  })
})

describe('VideoDetailPage - Transcript and playback', () => {
  const transcript = [
    '1\n00:00:00,000 --> 00:00:05,000\nFirst segment',
    '2\n00:00:05,000 --> 00:00:10,000\nSecond segment',
  ].join('\n\n')

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseVideoReturn = { video: { ...mockVideo, transcript }, isLoading: false, error: null }
    videoTrpcMocks.update.mockResolvedValue(mockVideo)
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  })

  afterEach(() => vi.restoreAllMocks())

  it('closes an unchanged transcript without updating or refetching cached data', async () => {
    const { result } = renderHook(() => useQueryClient())
    const queryKey = trpc.courses.get.queryKey({ id: 2 })
    const fetch = vi.fn(async () => ({ cached: true }))
    result.current.setQueryData(queryKey, { cached: true })
    const unsubscribe = new QueryObserver(result.current, {
      queryKey, queryFn: fetch, staleTime: Infinity,
    }).subscribe(() => {})
    try {
      render(<VideoDetailPage />)
      fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'First' } })
      fireEvent.click(screen.getByText('videos.detail.editTranscriptButton'))
      fireEvent.click(screen.getByText('videos.detail.saveTranscriptButton'))

      await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument())
      expect(screen.getByRole('searchbox')).toHaveValue('')
      expect(videoTrpcMocks.update).not.toHaveBeenCalled()
      expect(fetch).not.toHaveBeenCalled()
    } finally {
      unsubscribe()
    }
  })

  it('saves an edited transcript without changing its contents', async () => {
    const editedTranscript = `${transcript}\n\n3\n00:00:10,000 --> 00:00:15,000\n  Third segment  \n`
    render(<VideoDetailPage />)
    fireEvent.click(screen.getByText('videos.detail.editTranscriptButton'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: editedTranscript } })
    fireEvent.click(screen.getByText('videos.detail.saveTranscriptButton'))

    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument())
    expect(videoTrpcMocks.update).toHaveBeenCalledExactlyOnceWith({ id: 1, transcript: editedTranscript })
  })

  it('keeps the selected subtitle attached to the same segment when the search changes', () => {
    render(<VideoDetailPage />)
    const search = screen.getByRole('searchbox')
    fireEvent.change(search, { target: { value: 'Second' } })
    fireEvent.click(screen.getByRole('button', { name: /Second segment/ }))
    fireEvent.change(search, { target: { value: '' } })
    expect(screen.getByRole('button', { name: /Second segment/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: /First segment/ })).not.toHaveAttribute('aria-current')
    fireEvent.change(search, { target: { value: 'First' } })
    expect(screen.getByRole('button', { name: /First segment/ })).not.toHaveAttribute('aria-current')
  })

  it.each(['link', 'subtitle'])('tolerates autoplay rejection when seeking from a %s', async (trigger) => {
    const onPlay = vi.fn()
    // Return a real rejected promise; mock promise tracking also handles rejections.
    HTMLMediaElement.prototype.play = () => {
      onPlay()
      return Promise.reject(new DOMException('Autoplay blocked', 'NotAllowedError'))
    }
    if (trigger === 'link') mockSearchParams = new URLSearchParams('t=30')
    const { container } = render(<VideoDetailPage />)
    const player = container.querySelector('video')!
    await act(async () => {
      if (trigger === 'link') fireEvent.loadedMetadata(player)
      else fireEvent.click(screen.getByRole('button', { name: /Second segment/ }))
    })

    expect(player.currentTime).toBe(trigger === 'link' ? 30 : 5)
    expect(player.controls).toBe(true)
    expect(onPlay).toHaveBeenCalledTimes(1)
  })
})

describe('VideoDetailPage - Loading state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseVideoReturn = { video: null, isLoading: true, error: null }
  })

  afterEach(() => {
    mockUseVideoReturn = { video: mockVideo, isLoading: false, error: null }
  })

  it('should show loading content', () => {
    render(<VideoDetailPage />)
    expect(screen.getByText('Loading')).toBeInTheDocument()
  })
})

describe('VideoDetailPage - Error state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseVideoReturn = { video: null, isLoading: false, error: 'Network error' }
  })

  afterEach(() => {
    mockUseVideoReturn = { video: mockVideo, isLoading: false, error: null }
  })

  it('should show the error and a link back to the library', () => {
    render(<VideoDetailPage />)
    expect(screen.getByText('Network error')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'common.actions.backToList' })).toHaveAttribute('href', '/videos')
  })
})

describe('VideoDetailPage - Not found state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseVideoReturn = { video: null, isLoading: false, error: null }
  })

  afterEach(() => {
    mockUseVideoReturn = { video: mockVideo, isLoading: false, error: null }
  })

  it('should show the not-found message', () => {
    render(<VideoDetailPage />)
    expect(screen.getByText('common.messages.videoNotFound')).toBeInTheDocument()
  })
})

describe('VideoDetailPage - Delete', () => {
  it('should call deleteVideo when delete is confirmed', async () => {
      videoTrpcMocks.delete.mockResolvedValue({})

    render(<VideoDetailPage />)

    const deleteButton = screen.getByText('videos.detail.deleteButton')
    fireEvent.click(deleteButton)
    fireEvent.click(await screen.findByRole('button', { name: 'common.actions.delete' }))

    await waitFor(() => {
      expect(videoTrpcMocks.delete).toHaveBeenCalledWith({ id: 1 })
    })
  })
})
