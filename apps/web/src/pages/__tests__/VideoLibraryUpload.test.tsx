import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { apiClient } from '@/lib/api'
import { useAuthSession } from '@/lib/authSession'
import VideoLibraryPage from '../VideoLibraryPage'
import HomePage from '../HomePage'

describe('video library uploads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.__setMockPathname('/videos')
    globalThis.__setMockSearchParams('')
  })

  it.each(['file', 'youtube'] as const)(
    'refreshes videos after a %s upload and loads usage when returning home, without refreshing the session',
    async (source) => {
      let uploaded = false
      const video = {
        id: 42, user: '1', title: 'New video', status: 'completed' as const,
        description: '', source_type: 'uploaded' as const,
        file: '', uploaded_at: '2026-09-24T00:00:00Z',
      }
      const getAccount = vi.fn(() => ({
        id: 1, username: 'testuser', max_video_upload_size_mb: 500,
        used_storage_bytes: uploaded ? 2 * 1024 ** 3 : 0,
      }))
      const listVideos = vi.fn(() => ({
        data: uploaded ? [video] : [],
        meta: { total: uploaded ? 1 : 0, limit: 24, offset: 0 },
      }))
      const getCounts = vi.fn(() => ({
        total: uploaded ? 1 : 0, completed: uploaded ? 1 : 0,
        pending: 0, processing: 0, indexing: 0, error: 0, uploading: 0,
      }))
      const upload = vi.fn(async () => {
        uploaded = true
        return video
      })
      globalThis.__setTrpcHandler('account.me', getAccount)
      globalThis.__setTrpcHandler('videos.list', listVideos)
      globalThis.__setTrpcHandler('videos.statusCounts', getCounts)
      globalThis.__setTrpcHandler('videos.createYoutube', upload)
      globalThis.__setTrpcHandler('tags.list', () => ({
        data: [], meta: { total: 0, limit: 100, offset: 0 },
      }))
      globalThis.__setTrpcHandler('courses.list', () => ({
        data: [], meta: { total: 0, limit: 24, offset: 0 },
      }))
      vi.mocked(apiClient.uploadVideo).mockImplementation(upload)
      const sessionRefetch = useAuthSession().refetch
      const { rerender } = render(<VideoLibraryPage />)
      const openUpload = screen.getByRole('button', { name: 'videos.list.uploadButton' })
      await waitFor(() => expect(openUpload).toBeEnabled())
      await waitFor(() => expect(listVideos).toHaveBeenCalledTimes(1))
      fireEvent.click(openUpload)
      const dialog = screen.getByRole('dialog')
      if (source === 'file') {
        fireEvent.change(within(dialog).getByLabelText(/videos.upload.fileLabel/), {
          target: { files: [new File(['video'], 'New video.mp4', { type: 'video/mp4' })] },
        })
      } else {
        fireEvent.click(within(dialog).getByRole('button', { name: 'videos.upload.modes.youtube' }))
        fireEvent.change(within(dialog).getByLabelText(/videos.upload.youtubeUrlLabel/), {
          target: { value: 'https://www.youtube.com/watch?v=abcdef12345' },
        })
        fireEvent.change(within(dialog).getByLabelText(/videos.upload.titleLabel/), {
          target: { value: video.title },
        })
      }
      const submit = within(dialog).getByRole('button', { name: 'videos.upload.upload' })
      fireEvent.submit(submit.closest('form')!)
      await screen.findByText('videos.upload.success')
      await screen.findByText(video.title)
      await waitFor(() => expect(submit).toBeEnabled())
      expect(upload).toHaveBeenCalledTimes(1)
      expect(listVideos).toHaveBeenCalledTimes(2)
      expect(getCounts).toHaveBeenCalledTimes(2)
      expect(sessionRefetch).not.toHaveBeenCalled()
      expect(getAccount).toHaveBeenCalledTimes(1)

      globalThis.__setMockPathname('/')
      rerender(<HomePage />)
      await waitFor(() => expect(getAccount).toHaveBeenCalledTimes(2))
      await screen.findByText(/2\.0/)
      expect(sessionRefetch).not.toHaveBeenCalled()
    },
  )
})
