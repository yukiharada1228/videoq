import { prepareVideoUpload, runUploadWorkflow } from '../videoUpload'
import type { Video } from '../api'

const baseVideo: Video = {
  id: 42,
  user: 1,
  file: null,
  source_type: 'uploaded',
  title: 'Video',
  description: '',
  uploaded_at: '2026-06-02T00:00:00Z',
  status: 'pending',
}

const fileInput = {
  source: 'file' as const, title: 'Video', description: '', maxSizeMb: 500,
}

function prepared(input: Parameters<typeof prepareVideoUpload>[0]) {
  const result = prepareVideoUpload(input)
  expect(result.isValid).toBe(true)
  if (!result.isValid) throw new Error(result.error)
  return result.upload
}

describe('prepareVideoUpload', () => {
  it.each([
    ['not-video.txt', 'video/mp4'],
    ['unsupported.ogv', 'video/ogg'],
    ['video.mp4', 'text/plain'],
    ['.mp4', 'video/mp4'],
  ])('rejects files the upload API cannot accept: %s (%s)', (name, type) => {
    expect(prepareVideoUpload({ ...fileInput, file: new File(['content'], name, { type }) }))
      .toEqual({ isValid: false, error: 'videos.upload.validation.invalidFileType' })
  })

  it.each(['', 'application/octet-stream'])('accepts a supported extension when the browser reports %s', type => {
    const file = new File(['content'], 'video.MKV', { type })
    expect(prepared({ ...fileInput, file })).toEqual({
      source: 'file', data: { file, title: 'Video', description: undefined },
    })
  })

  it('validates file-specific requirements', () => {
    expect(prepareVideoUpload({ ...fileInput, file: null, title: '' })).toEqual({
      isValid: false, error: 'videos.upload.validation.noFile',
    })
    expect(prepareVideoUpload({ ...fileInput, file: new File(['content'], 'notes.txt', { type: 'text/plain' }) }))
      .toEqual({ isValid: false, error: 'videos.upload.validation.invalidFileType' })

    const file = new File(['content'], 'large.mp4', { type: 'video/mp4' })
    Object.defineProperty(file, 'size', { value: 501 * 1024 * 1024 })
    expect(prepareVideoUpload({ ...fileInput, file })).toEqual({
      isValid: false,
      error: 'videos.upload.validation.fileTooLarge',
      errorParams: { max_size_mb: 500 },
    })
  })

  it('validates youtube-specific requirements', () => {
    expect(prepareVideoUpload({ source: 'youtube', youtubeUrl: ' ', title: 'Video', description: '' }))
      .toEqual({ isValid: false, error: 'videos.upload.validation.noYoutubeUrl' })
    expect(prepareVideoUpload({ source: 'youtube', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ', title: ' ', description: '' }))
      .toEqual({ isValid: false, error: 'videos.upload.validation.noTitle' })
  })
})

describe('runUploadWorkflow', () => {
  it('uses the filename title fallback and forwards upload progress', async () => {
    const file = new File(['content'], 'session-recording.MP4', { type: '' })
    const onProgress = vi.fn()
    const api = {
      uploadVideo: vi.fn().mockResolvedValue(baseVideo),
      createYoutubeVideo: vi.fn(),
      addTagsToVideo: vi.fn(),
    }
    const upload = prepared({ ...fileInput, file, title: '  ', description: '  trimmed description  ' })

    await expect(runUploadWorkflow(upload, [], api, onProgress)).resolves.toBeNull()
    expect(api.uploadVideo).toHaveBeenCalledExactlyOnceWith(
      { file, title: 'session-recording', description: 'trimmed description' }, onProgress,
    )
    expect(api.createYoutubeVideo).not.toHaveBeenCalled()
    expect(api.addTagsToVideo).not.toHaveBeenCalled()
  })

  it('passes the trimmed YouTube input directly to its typed transport', async () => {
    const api = {
      uploadVideo: vi.fn(),
      createYoutubeVideo: vi.fn().mockResolvedValue({ ...baseVideo, source_type: 'youtube' }),
      addTagsToVideo: vi.fn(),
    }
    const upload = prepared({
      source: 'youtube', youtubeUrl: '  https://www.youtube.com/watch?v=dQw4w9WgXcQ  ',
      title: '  YouTube title  ', description: '  ',
    })

    await runUploadWorkflow(upload, [], api)
    expect(api.createYoutubeVideo).toHaveBeenCalledExactlyOnceWith({
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'YouTube title', description: undefined,
    })
    expect(api.uploadVideo).not.toHaveBeenCalled()
    expect(api.addTagsToVideo).not.toHaveBeenCalled()
  })

  it('treats tag assignment as an explicit post-upload warning', async () => {
    const file = new File(['content'], 'tagged.mp4', { type: 'video/mp4' })
    const api = {
      uploadVideo: vi.fn().mockResolvedValue(baseVideo),
      createYoutubeVideo: vi.fn(),
      addTagsToVideo: vi.fn().mockRejectedValue(new Error('Tag write failed')),
    }

    await expect(runUploadWorkflow(prepared({ ...fileInput, file, title: 'Tagged' }), [1, 2], api))
      .resolves.toBe('videos.upload.warning.tagsFailed')
    expect(api.addTagsToVideo).toHaveBeenCalledExactlyOnceWith({ videoId: 42, tagIds: [1, 2] })
  })
})
