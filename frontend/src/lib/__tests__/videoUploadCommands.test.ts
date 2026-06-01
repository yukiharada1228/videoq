import {
  FileUploadCommand,
  YoutubeImportCommand,
  runUploadWorkflow,
} from '../videoUploadCommands'
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

describe('FileUploadCommand', () => {
  it('validates file-specific requirements', () => {
    const missingFile = new FileUploadCommand({
      file: null,
      title: '',
      description: '',
      maxSizeMb: 500,
    })

    expect(missingFile.validate()).toEqual({
      isValid: false,
      error: 'videos.upload.validation.noFile',
    })

    const textFile = new File(['content'], 'notes.txt', { type: 'text/plain' })
    const invalidType = new FileUploadCommand({
      file: textFile,
      title: 'Notes',
      description: '',
      maxSizeMb: 500,
    })

    expect(invalidType.validate()).toEqual({
      isValid: false,
      error: 'videos.upload.validation.invalidFileType',
    })

    const oversizedFile = new File(['content'], 'large.mp4', { type: 'video/mp4' })
    Object.defineProperty(oversizedFile, 'size', { value: 501 * 1024 * 1024 })
    const oversized = new FileUploadCommand({
      file: oversizedFile,
      title: 'Large video',
      description: '',
      maxSizeMb: 500,
    })

    expect(oversized.validate()).toEqual({
      isValid: false,
      error: 'videos.upload.validation.fileTooLarge',
      errorParams: { max_size_mb: 500 },
    })
  })

  it('uses the filename title fallback and forwards upload progress', async () => {
    const file = new File(['content'], 'session-recording.MP4', { type: '' })
    const onProgress = vi.fn()
    const api = {
      uploadVideo: vi.fn().mockResolvedValue(baseVideo),
      createYoutubeVideo: vi.fn(),
      addTagsToVideo: vi.fn(),
    }

    const command = new FileUploadCommand({
      file,
      title: '  ',
      description: '  trimmed description  ',
      maxSizeMb: 500,
      onProgress,
    })

    await expect(command.execute(api)).resolves.toBe(baseVideo)

    expect(api.uploadVideo).toHaveBeenCalledWith(
      {
        file,
        title: 'session-recording',
        description: 'trimmed description',
      },
      onProgress,
    )
  })
})

describe('YoutubeImportCommand', () => {
  it('validates youtube-specific requirements', () => {
    const missingUrl = new YoutubeImportCommand({
      youtubeUrl: ' ',
      title: 'Video',
      description: '',
    })

    expect(missingUrl.validate()).toEqual({
      isValid: false,
      error: 'videos.upload.validation.noYoutubeUrl',
    })

    const missingTitle = new YoutubeImportCommand({
      youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
      title: ' ',
      description: '',
    })

    expect(missingTitle.validate()).toEqual({
      isValid: false,
      error: 'videos.upload.validation.noTitle',
    })
  })

  it('trims youtube import payload before sending it to the API', async () => {
    const api = {
      uploadVideo: vi.fn(),
      createYoutubeVideo: vi.fn().mockResolvedValue({ ...baseVideo, source_type: 'youtube' }),
      addTagsToVideo: vi.fn(),
    }

    const command = new YoutubeImportCommand({
      youtubeUrl: '  https://www.youtube.com/watch?v=dQw4w9WgXcQ  ',
      title: '  YouTube title  ',
      description: '  ',
    })

    await command.execute(api)

    expect(api.createYoutubeVideo).toHaveBeenCalledWith({
      youtube_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'YouTube title',
      description: undefined,
    })
  })
})

describe('runUploadWorkflow', () => {
  it('treats tag assignment as an explicit post-upload warning', async () => {
    const file = new File(['content'], 'tagged.mp4', { type: 'video/mp4' })
    const api = {
      uploadVideo: vi.fn().mockResolvedValue(baseVideo),
      createYoutubeVideo: vi.fn(),
      addTagsToVideo: vi.fn().mockRejectedValue(new Error('Tag write failed')),
    }
    const command = new FileUploadCommand({
      file,
      title: 'Tagged',
      description: '',
      maxSizeMb: 500,
    })

    await expect(runUploadWorkflow(command, [1, 2], api)).resolves.toEqual({
      video: baseVideo,
      warning: {
        message: 'videos.upload.warning.tagsFailed',
      },
    })

    expect(api.addTagsToVideo).toHaveBeenCalledWith(42, [1, 2])
  })
})
