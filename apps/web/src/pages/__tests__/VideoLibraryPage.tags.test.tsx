import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import VideoLibraryPage from '../VideoLibraryPage'

// Keep the tag modal, useTags, and query client real to exercise their lifecycle.
vi.mock('@/hooks/useVideos', () => ({
  useVideos: () => ({ videos: [], isLoading: false, error: null, totalCount: 0 }),
  IN_PROGRESS_STATUSES: ['pending', 'processing', 'indexing', 'uploading'],
}))

vi.mock('@/hooks/useVideoStats', () => ({
  useVideoStatusCounts: () => ({
    stats: { total: 0, completed: 0, pending: 0, processing: 0, indexing: 0 },
  }),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 1 }, isLoading: false, refetch: vi.fn() }),
}))

vi.mock('@/components/video/VideoUploadModal', () => ({ VideoUploadModal: () => null }))

const deleteTag = vi.fn()
type CloseMethod = 'close button' | 'Escape'

function requestClose(method: CloseMethod) {
  if (method === 'close button') {
    fireEvent.click(screen.getByRole('button', { name: 'common.actions.close' }))
  } else {
    // Escape emits a native dialog cancel event; jsdom does not simulate it.
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
  }
}

async function startDeletion() {
  render(<VideoLibraryPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'videos.list.manageTags' }))
  fireEvent.click(screen.getByTestId('delete-tag-1'))
  fireEvent.click(screen.getByTestId('confirm-delete-1'))
  await waitFor(() => expect(deleteTag).toHaveBeenCalledWith({ id: 1 }))
  await waitFor(() => expect(screen.getByTestId('confirm-delete-1')).toBeDisabled())
}

describe('VideoLibraryPage tag deletion lifecycle', () => {
  beforeEach(() => {
    deleteTag.mockReset()
    globalThis.__setTrpcHandler('tags.list', () => ({
      data: [{ id: 1, name: 'Tag 1', color: 'red', video_count: 0, created_at: '2023-01-01' }],
      meta: { total: 1, limit: 100, offset: 0 },
    }))
    globalThis.__setTrpcHandler('tags.delete', input => deleteTag(input))
  })

  it.each<CloseMethod>(['close button', 'Escape'])(
    'blocks %s during deletion, shows a failure, and clears it after reopening',
    async (closeMethod) => {
      let rejectDelete!: (error: Error) => void
      deleteTag.mockReturnValue(new Promise<never>((_, reject) => { rejectDelete = reject }))
      const log = vi.spyOn(console, 'error').mockImplementation(() => {})

      try {
        await startDeletion()
        const modal = screen.getByRole('dialog')
        expect.soft(screen.getByRole('button', { name: 'common.actions.close' })).toBeDisabled()

        requestClose(closeMethod)
        expect.soft(modal).toBeInTheDocument()
        expect.soft(modal).toHaveAttribute('open')

        rejectDelete(new Error('Failed to delete tag'))
        expect(await screen.findByRole('alert')).toHaveTextContent('Failed to delete tag')
        expect(deleteTag).toHaveBeenCalledTimes(1)
        expect(screen.getByTestId('confirm-delete-1')).not.toBeDisabled()
        expect(screen.getByRole('button', { name: 'common.actions.close' })).not.toBeDisabled()

        requestClose(closeMethod)
        expect(modal).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'videos.list.manageTags' }))
        expect(screen.getByRole('dialog')).toBeInTheDocument()
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        expect(screen.getByTestId('delete-tag-1')).not.toBeDisabled()
        expect(screen.queryByTestId('confirm-delete-1')).not.toBeInTheDocument()
      } finally {
        log.mockRestore()
      }
    },
  )

  it('allows closing after deletion succeeds', async () => {
    let resolveDelete!: (result: { id: number }) => void
    deleteTag.mockReturnValue(new Promise<{ id: number }>(resolve => { resolveDelete = resolve }))

    await startDeletion()
    resolveDelete({ id: 1 })

    const modal = screen.getByRole('dialog')
    await waitFor(() => expect(within(modal).queryByText('Tag 1')).not.toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'common.actions.close' })).not.toBeDisabled()

    requestClose('close button')
    expect(modal).not.toBeInTheDocument()
  })
})
