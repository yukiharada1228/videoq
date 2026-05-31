import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react'
import { apiClient, type VideoGroup } from '@/lib/api'
import { useShareLink } from '../useShareLink'

vi.mock('@/lib/api', () => ({
  apiClient: {
    createShareLink: vi.fn(),
    deleteShareLink: vi.fn(),
  },
}))

const group: VideoGroup = {
  id: 1,
  name: 'Group',
  description: '',
  videos: [],
  video_count: 0,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  share_slug: 'share-token',
}

describe('useShareLink', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn(),
      },
    })
  })

  it('uses the shared confirm dialog before disabling a share link', async () => {
    ;(apiClient.deleteShareLink as ReturnType<typeof vi.fn>).mockResolvedValue({})
    const { result } = renderHook(() => useShareLink(group))

    act(() => {
      void result.current.deleteShareLink()
    })

    expect(await screen.findByRole('dialog', { name: 'confirmations.disableShareLink' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'common.actions.disable' }))

    await waitFor(() => {
      expect(apiClient.deleteShareLink).toHaveBeenCalledWith(1)
    })
  })

  it('shows a toast when copying the share link fails', async () => {
    const clipboard = navigator.clipboard as { writeText: ReturnType<typeof vi.fn> }
    clipboard.writeText.mockRejectedValue(new Error('copy failed'))
    const { result } = renderHook(() => useShareLink(group))

    await waitFor(() => {
      expect(result.current.shareLink).toContain('/share/share-token')
    })

    await act(async () => {
      await result.current.copyShareLink()
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('common.messages.copyFailed')
  })
})
