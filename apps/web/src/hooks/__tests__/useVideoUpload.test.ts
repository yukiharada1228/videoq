import { renderHook, act, waitFor } from '@testing-library/react'
import { useVideoUpload } from '../useVideoUpload'
import { useTags } from '../useTags'
import { apiClient } from '@/lib/api'
import { QueryObserver, useQueryClient } from '@tanstack/react-query'
import { trpc } from '@/lib/trpc'
import { trackLandingEvent } from '@/lib/landingAnalytics'
import { compressVideo } from '@/lib/videoCompression'

vi.mock('@/lib/videoCompression', () => ({ compressVideo: vi.fn(), supportsVideoCompression: () => true }))

vi.mock('@/lib/landingAnalytics', () => ({ trackLandingEvent: vi.fn() }))

const createYoutubeVideo = vi.fn()
const addTagsToVideo = vi.fn()

// Mock apiClient
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return {
    ...actual,
    apiClient: {
      uploadVideo: vi.fn(),
    },
  }
})

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 1, username: 'testuser', max_video_upload_size_mb: 500 },
    isLoading: false,
  }),
}))

describe('useVideoUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(apiClient.uploadVideo).mockReset()
    vi.mocked(compressVideo).mockReset()
    createYoutubeVideo.mockReset()
    addTagsToVideo.mockReset()
    globalThis.__setTrpcHandler('videos.createYoutube', createYoutubeVideo)
    globalThis.__setTrpcHandler('memberships.addTags', addTagsToVideo)
  })

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useVideoUpload())

    expect(result.current.title).toBe('')
    expect(result.current.description).toBe('')
    expect(result.current.isUploading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.warning).toBeNull()
    expect(result.current.success).toBe(false)
  })

  it('compresses an oversized source before reservation and uploads only the smaller file', async () => {
    const source = new File(['original'], 'game.mkv', { type: 'video/matroska' })
    Object.defineProperty(source, 'size', { value: 45_159_504_400 })
    const compressed = new File(['compressed'], 'game-1080p.mp4', { type: 'video/mp4' })
    const dispose = vi.fn(async () => {})
    vi.mocked(compressVideo).mockResolvedValue({ file: compressed, dispose })
    vi.mocked(apiClient.uploadVideo).mockResolvedValue({ id: 1 } as never)
    const { result } = renderHook(() => useVideoUpload())
    act(() => result.current.handleFileChange({ target: { files: [source] } } as unknown as React.ChangeEvent<HTMLInputElement>))
    expect(result.current.error).toBe('videos.upload.validation.fileTooLarge')
    act(() => result.current.setCompressionPreset('1080p'))
    expect(result.current.error).toBeNull()
    await act(() => result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent))
    expect(compressVideo).toHaveBeenCalledWith(source, '1080p', expect.objectContaining({ maxBytes: 500 * 1024 ** 2 }))
    expect(apiClient.uploadVideo).toHaveBeenCalledWith({ file: compressed, title: 'game', description: undefined }, expect.any(Function))
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(result.current.compressedSizes).toEqual({ before: source.size, after: compressed.size })
    expect(result.current.success).toBe(true)
  })

  it.each(['canceled', 'unsupported'])('does not send the original or reserve an upload when compression is %s', async reason => {
    const source = new File(['original'], 'game.mkv', { type: 'video/matroska' })
    vi.mocked(compressVideo).mockImplementation((_file, _preset, { signal }) => new Promise((_resolve, reject) => {
      if (reason === 'unsupported') reject(new Error('videos.upload.compression.unsupportedFile'))
      else signal.addEventListener('abort', () => reject(new DOMException('Canceled', 'AbortError')), { once: true })
    }))
    const { result } = renderHook(() => useVideoUpload())
    act(() => {
      result.current.handleFileChange({ target: { files: [source] } } as unknown as React.ChangeEvent<HTMLInputElement>)
      result.current.setCompressionPreset('720p')
    })
    let pending: Promise<void>
    act(() => { pending = result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent) })
    if (reason === 'canceled') {
      expect(result.current.isCompressing).toBe(true)
      await act(() => result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent))
      expect(compressVideo).toHaveBeenCalledTimes(1)
      act(() => result.current.cancelCompression())
    }
    await act(() => pending!)
    expect(apiClient.uploadVideo).not.toHaveBeenCalled()
    expect(result.current.isUploading).toBe(false)
    expect(result.current.success).toBe(false)
    expect(result.current.title).toBe('game')
    expect(result.current.error).toBe(`videos.upload.compression.${reason === 'canceled' ? 'canceled' : 'unsupportedFile'}`)
  })

  it('disposes compressed output on transport failure, retaining the original for a new attempt', async () => {
    const source = new File(['original'], 'game.mkv', { type: 'video/matroska' })
    const dispose = vi.fn(async () => {})
    vi.mocked(compressVideo).mockResolvedValue({ file: new File(['small'], 'game.mp4', { type: 'video/mp4' }), dispose })
    vi.mocked(apiClient.uploadVideo).mockRejectedValue(new Error('network failed'))
    const { result } = renderHook(() => useVideoUpload())
    act(() => {
      result.current.handleFileChange({ target: { files: [source] } } as unknown as React.ChangeEvent<HTMLInputElement>)
      result.current.setCompressionPreset('1080p')
    })
    await act(async () => {
      await expect(result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent)).rejects.toThrow('network failed')
    })
    expect(dispose).toHaveBeenCalledTimes(1)
    act(() => result.current.setCompressionPreset('original'))
    vi.mocked(apiClient.uploadVideo).mockResolvedValue({ id: 1 } as never)
    await act(() => result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent))
    expect(apiClient.uploadVideo).toHaveBeenLastCalledWith(expect.objectContaining({ file: source }), expect.any(Function))
    expect(compressVideo).toHaveBeenCalledTimes(1)
  })

  it.each(['file', 'youtube'] as const)('does not create duplicate %s videos during one upload', async mode => {
    const { result } = renderHook(() => useVideoUpload())
    let finish!: (video: { id: number }) => void
    const pending = new Promise<{ id: number }>(resolve => { finish = resolve })
    const transport = mode === 'file' ? vi.mocked(apiClient.uploadVideo) : createYoutubeVideo
    transport.mockImplementation(() => pending as ReturnType<typeof apiClient.uploadVideo>)
    act(() => {
      if (mode === 'file') {
        result.current.handleFileChange({ target: { files: [new File(['video'], 'video.mp4', { type: 'video/mp4' })] } } as unknown as React.ChangeEvent<HTMLInputElement>)
      } else {
        result.current.setSourceMode('youtube')
        result.current.setYoutubeUrl('https://youtu.be/dQw4w9WgXcQ')
        result.current.setTitle('YouTube video')
      }
    })
    const event = { preventDefault: vi.fn() } as unknown as React.FormEvent
    let submissions: Promise<void>[] = []
    act(() => {
      submissions = [result.current.handleSubmit(event), result.current.handleSubmit(event)]
    })
    try {
      await waitFor(() => expect(transport).toHaveBeenCalledTimes(1))
      await waitFor(() => expect(result.current.isUploading).toBe(true))
      if (mode === 'file') {
        act(() => vi.mocked(apiClient.uploadVideo).mock.calls[0][1]?.(46))
        expect(result.current.progress).toBe(46)
      }
      await act(() => result.current.handleSubmit(event))
      expect(transport).toHaveBeenCalledTimes(1)
      if (mode === 'file') expect(result.current.progress).toBe(46)
    } finally {
      await act(async () => {
        finish({ id: 1 })
        await Promise.all(submissions)
      })
    }
    expect(result.current.success).toBe(true)
    await act(() => result.current.handleSubmit(event))
    expect(transport).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['test-video.mp4', 'video/mp4'],
    ['test-video.mkv', 'video/matroska'],
    ['test-video.MKV', 'video/x-matroska'],
  ])('should accept file selection: %s (%s)', (name, type) => {
    const { result } = renderHook(() => useVideoUpload())
    const file = new File(['content'], name, { type })

    act(() => {
      result.current.handleFileChange({
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    })

    expect(result.current.title).toBe('test-video')
    expect(result.current.error).toBeNull()
  })

  it('should reject non-video files on file change', () => {
    const { result } = renderHook(() => useVideoUpload())
    const file = new File(['content'], 'notes.txt', { type: 'text/plain' })

    act(() => {
      result.current.handleFileChange({
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    })

    expect(result.current.error).toBe('videos.upload.validation.invalidFileType')
  })

  it('should reject oversized files on file change', () => {
    const { result } = renderHook(() => useVideoUpload())
    const file = new File(['content'], 'large-video.mp4', { type: 'video/mp4' })
    Object.defineProperty(file, 'size', { value: 501 * 1024 * 1024 })

    act(() => {
      result.current.handleFileChange({
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    })

    expect(result.current.error).toBe('videos.upload.validation.fileTooLarge')
  })

  it('should update title', () => {
    const { result } = renderHook(() => useVideoUpload())

    act(() => {
      result.current.setTitle('New Title')
    })

    expect(result.current.title).toBe('New Title')
  })

  it('should update description', () => {
    const { result } = renderHook(() => useVideoUpload())

    act(() => {
      result.current.setDescription('New Description')
    })

    expect(result.current.description).toBe('New Description')
  })

  it('should validate and upload video', async () => {
    const { result } = renderHook(() => useVideoUpload())
    const file = new File(['content'], 'test-video.mp4', { type: 'video/mp4' })
    ;(apiClient.uploadVideo as any).mockResolvedValue(undefined)

    act(() => {
      result.current.handleFileChange({
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    })

    act(() => {
      result.current.setTitle('Test Video')
    })

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent)
    })

    await waitFor(() => {
      expect(apiClient.uploadVideo).toHaveBeenCalledWith(
        { file, title: 'Test Video', description: undefined },
        expect.any(Function),
      )
      expect(result.current.success).toBe(true)
    })
    expect(vi.mocked(trackLandingEvent).mock.calls.map(([event]) => event))
      .toEqual(['video_upload_started', 'video_upload_accepted'])
  })

  it('records a failed upload without treating it as accepted', async () => {
    vi.mocked(apiClient.uploadVideo).mockRejectedValue(new Error('Upload failed'))
    const { result } = renderHook(() => useVideoUpload())
    act(() => result.current.handleFileChange({ target: { files: [
      new File(['video'], 'lecture.mp4', { type: 'video/mp4' }),
    ] } } as unknown as React.ChangeEvent<HTMLInputElement>))
    await act(async () => {
      await expect(result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent))
        .rejects.toThrow('Upload failed')
    })
    expect(vi.mocked(trackLandingEvent).mock.calls.map(([event]) => event))
      .toEqual(['video_upload_started', 'video_upload_failed'])
  })

  it('should show error if file is not selected', async () => {
    const { result } = renderHook(() => useVideoUpload())

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent)
    })

    await waitFor(() => {
      expect(result.current.error).toBeDefined()
    })
    expect(trackLandingEvent).not.toHaveBeenCalled()
  })

  it('should use filename as title if title is empty', async () => {
    const { result } = renderHook(() => useVideoUpload())
    const file = new File(['content'], 'my-video.mp4', { type: 'video/mp4' })
    ;(apiClient.uploadVideo as any).mockResolvedValue(undefined)

    act(() => {
      result.current.handleFileChange({
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    })

    act(() => {
      result.current.setTitle('')
    })

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent)
    })

    await waitFor(() => {
      expect(apiClient.uploadVideo).toHaveBeenCalledWith(
        { file, title: 'my-video', description: undefined },
        expect.any(Function),
      )
    })
  })

  it('refreshes video data once before completing the upload', async () => {
    const { result } = renderHook(() => ({ ...useVideoUpload(), client: useQueryClient() }))
    const file = new File(['content'], 'test-video.mp4', { type: 'video/mp4' })
    const queryKey = trpc.videos.list.queryKey({ limit: 24 })
    const fetchVideos = vi.fn(async () => ({ refreshed: true }))
    result.current.client.setQueryData(queryKey, { refreshed: false })
    const unsubscribe = new QueryObserver(result.current.client, {
      queryKey, queryFn: fetchVideos, staleTime: Infinity,
    }).subscribe(() => {})
    ;(apiClient.uploadVideo as any).mockResolvedValue(undefined)

    act(() => {
      result.current.handleFileChange({
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    })

    try {
      await act(async () => {
        await result.current.handleSubmit(
          { preventDefault: vi.fn() } as unknown as React.FormEvent
        )
      })
      expect(fetchVideos).toHaveBeenCalledTimes(1)
      expect(result.current.client.getQueryData(queryKey)).toEqual({ refreshed: true })
    } finally {
      unsubscribe()
    }
  })

  it('should reset form', () => {
    const { result } = renderHook(() => useVideoUpload())

    act(() => {
      result.current.setTitle('Title')
      result.current.setDescription('Description')
    })

    act(() => {
      result.current.reset()
    })

    expect(result.current.title).toBe('')
    expect(result.current.description).toBe('')
    expect(result.current.error).toBeNull()
    expect(result.current.success).toBe(false)
  })

  it('should create youtube video when source mode is youtube', async () => {
    const { result } = renderHook(() => useVideoUpload())
    createYoutubeVideo.mockResolvedValue({ id: 1 })

    act(() => {
      result.current.setSourceMode('youtube')
      result.current.setYoutubeUrl('https://youtu.be/dQw4w9WgXcQ')
      result.current.setTitle('YouTube Title')
      result.current.setDescription('YouTube Description')
    })

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent)
    })

    await waitFor(() => {
      expect(createYoutubeVideo).toHaveBeenCalledWith({
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
        title: 'YouTube Title',
        description: 'YouTube Description',
      })
      expect(result.current.success).toBe(true)
    })
  })

  it('should keep upload successful and expose warning when tag assignment fails', async () => {
    const { result } = renderHook(() => useVideoUpload())
    const file = new File(['content'], 'tagged-video.mp4', { type: 'video/mp4' })
    ;(apiClient.uploadVideo as any).mockResolvedValue({ id: 1 })
    addTagsToVideo.mockRejectedValue(new Error('Tag write failed'))

    act(() => {
      result.current.handleFileChange({
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    })

    act(() => {
      result.current.setTagIds([10, 20])
    })

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent)
    })

    await waitFor(() => {
      expect(addTagsToVideo).toHaveBeenCalledWith({ videoId: 1, tagIds: [10, 20] })
      expect(result.current.success).toBe(true)
      expect(result.current.warning).toBe('videos.upload.warning.tagsFailed')
      expect(result.current.error).toBeNull()
    })
  })

  it.each(['none', 'assigned', 'failed'])('refreshes tag counts only after attempted assignment (%s)', async assignment => {
    let count = 0
    const listTags = vi.fn(() => ({
      data: [{ id: 10, name: 'Tag', color: 'blue', created_at: '2026-09-23T00:00:00Z', video_count: count }],
      meta: { total: 1, limit: 100, offset: 0 },
    }))
    globalThis.__setTrpcHandler('tags.list', listTags)
    createYoutubeVideo.mockResolvedValue({ id: 1 })
    addTagsToVideo.mockImplementation(() => {
      count = 1
      // The write may persist even when its response is lost.
      if (assignment === 'failed') throw new Error('Tag response lost')
      return { message: 'Added', added_count: 1, skipped_count: 0 }
    })
    const { result } = renderHook(() => ({ upload: useVideoUpload(), tags: useTags() }))
    await waitFor(() => expect(result.current.tags.tags[0]?.video_count).toBe(0))
    act(() => {
      result.current.upload.setSourceMode('youtube')
      result.current.upload.setYoutubeUrl('https://youtu.be/dQw4w9WgXcQ')
      result.current.upload.setTitle('YouTube video')
      result.current.upload.setTagIds(assignment === 'none' ? [] : [10])
    })

    await act(() => result.current.upload.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent))

    await waitFor(() => expect(result.current.tags.tags[0]?.video_count).toBe(assignment === 'none' ? 0 : 1))
    expect(result.current.upload.success).toBe(true)
    expect(listTags).toHaveBeenCalledTimes(assignment === 'none' ? 1 : 2)
    expect(addTagsToVideo).toHaveBeenCalledTimes(assignment === 'none' ? 0 : 1)
  })

  it('should handle upload errors', async () => {
    const { result } = renderHook(() => useVideoUpload())
    const file = new File(['content'], 'test-video.mp4', { type: 'video/mp4' })
    const error = new Error('Upload failed')
    ;(apiClient.uploadVideo as any).mockRejectedValue(error)

    act(() => {
      result.current.handleFileChange({
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    })

    await act(async () => {
      try {
        await result.current.handleSubmit({
          preventDefault: vi.fn(),
        } as unknown as React.FormEvent)
      } catch {
        // Expected to throw
      }
    })

    await waitFor(() => {
      expect(result.current.error).toBe('Upload failed')
      expect(result.current.isUploading).toBe(false)
    })

    vi.mocked(apiClient.uploadVideo).mockResolvedValue({ id: 1 } as Awaited<ReturnType<typeof apiClient.uploadVideo>>)
    await act(() => result.current.handleSubmit({ preventDefault: vi.fn() } as unknown as React.FormEvent))
    expect(apiClient.uploadVideo).toHaveBeenCalledTimes(2)
    expect(result.current.error).toBeNull()
    expect(result.current.success).toBe(true)
  })
})
