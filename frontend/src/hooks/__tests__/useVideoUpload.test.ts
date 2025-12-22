import { renderHook, act, waitFor } from '@testing-library/react'
import { useVideoUpload } from '../useVideoUpload'
import { apiClient } from '@/lib/api'

// Mock apiClient
jest.mock('@/lib/api', () => ({
  apiClient: {
    uploadVideo: jest.fn(),
  },
}))

describe('useVideoUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useVideoUpload())

    expect(result.current.file).toBeNull()
    expect(result.current.title).toBe('')
    expect(result.current.description).toBe('')
    expect(result.current.isUploading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.success).toBe(false)
  })

  it('should handle file change', () => {
    const { result } = renderHook(() => useVideoUpload())
    const file = new File(['content'], 'test-video.mp4', { type: 'video/mp4' })

    act(() => {
      result.current.handleFileChange({
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    })

    expect(result.current.file).toBe(file)
    expect(result.current.title).toBe('test-video')
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
    ;(apiClient.uploadVideo as jest.Mock).mockResolvedValue(undefined)

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
        preventDefault: jest.fn(),
      } as unknown as React.FormEvent)
    })

    await waitFor(() => {
      expect(apiClient.uploadVideo).toHaveBeenCalledWith({
        file,
        title: 'Test Video',
        description: undefined,
      })
      expect(result.current.success).toBe(true)
    })
  })

  it('should show error if file is not selected', async () => {
    const { result } = renderHook(() => useVideoUpload())

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: jest.fn(),
      } as unknown as React.FormEvent)
    })

    await waitFor(() => {
      expect(result.current.error).toBeDefined()
    })
  })

  it('should use filename as title if title is empty', async () => {
    const { result } = renderHook(() => useVideoUpload())
    const file = new File(['content'], 'my-video.mp4', { type: 'video/mp4' })
    ;(apiClient.uploadVideo as jest.Mock).mockResolvedValue(undefined)

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
        preventDefault: jest.fn(),
      } as unknown as React.FormEvent)
    })

    await waitFor(() => {
      expect(apiClient.uploadVideo).toHaveBeenCalledWith({
        file,
        title: 'my-video',
        description: undefined,
      })
    })
  })

  it('should call onSuccess callback', async () => {
    const { result } = renderHook(() => useVideoUpload())
    const file = new File(['content'], 'test-video.mp4', { type: 'video/mp4' })
    const onSuccess = jest.fn()
    ;(apiClient.uploadVideo as jest.Mock).mockResolvedValue(undefined)

    act(() => {
      result.current.handleFileChange({
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    })

    await act(async () => {
      await result.current.handleSubmit(
        {
          preventDefault: jest.fn(),
        } as unknown as React.FormEvent,
        onSuccess
      )
    })

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled()
    })
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

    expect(result.current.file).toBeNull()
    expect(result.current.title).toBe('')
    expect(result.current.description).toBe('')
    expect(result.current.error).toBeNull()
    expect(result.current.success).toBe(false)
  })

  it('should handle upload errors', async () => {
    const { result } = renderHook(() => useVideoUpload())
    const file = new File(['content'], 'test-video.mp4', { type: 'video/mp4' })
    const error = new Error('Upload failed')
    ;(apiClient.uploadVideo as jest.Mock).mockRejectedValue(error)

    act(() => {
      result.current.handleFileChange({
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>)
    })

    await act(async () => {
      try {
        await result.current.handleSubmit({
          preventDefault: jest.fn(),
        } as unknown as React.FormEvent)
      } catch {
        // Expected to throw
      }
    })

    await waitFor(() => {
      expect(result.current.error).toBe('Upload failed')
      expect(result.current.isUploading).toBe(false)
    })
  })
})

