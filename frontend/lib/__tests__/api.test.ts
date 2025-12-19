import { apiClient } from '../api'

// Mock fetch
global.fetch = jest.fn()

beforeAll(() => {
  // Ensure TextEncoder/TextDecoder exist in Jest environment
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = global as any
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const util = (() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('util')
    } catch {
      return null
    }
  })()

  if (typeof TextEncoder === 'undefined' && util?.TextEncoder) {
    g.TextEncoder = util.TextEncoder
  }
  if (typeof TextDecoder === 'undefined' && util?.TextDecoder) {
    g.TextDecoder = util.TextDecoder
  }
})

// Mock ReadableStream
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.ReadableStream = class ReadableStream {} as any

// Mock URL
global.URL = class URL {
  searchParams: URLSearchParams
  href: string
  constructor(public input: string) {
    this.href = input
    this.searchParams = new URLSearchParams()
    if (input.includes('?')) {
      const [path, query] = input.split('?')
      this.href = path
      this.searchParams = new URLSearchParams(query)
    }
  }
  toString() {
    if (this.searchParams.toString()) {
      return `${this.href}?${this.searchParams.toString()}`
    }
    return this.href
  }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

// Mock document methods
Object.defineProperty(document, 'createElement', {
  value: jest.fn(() => ({
    click: jest.fn(),
    href: '',
    download: '',
  })),
  writable: true,
})

Object.defineProperty(document.body, 'appendChild', {
  value: jest.fn(),
  writable: true,
})

Object.defineProperty(document.body, 'removeChild', {
  value: jest.fn(),
  writable: true,
})

// Mock URL constructor
const MockURL = class URL {
  searchParams: URLSearchParams
  href: string
  constructor(public input: string) {
    this.href = input
    this.searchParams = new URLSearchParams()
    if (input.includes('?')) {
      const [path, query] = input.split('?')
      this.href = path
      this.searchParams = new URLSearchParams(query)
    }
  }
  toString() {
    if (this.searchParams.toString()) {
      return `${this.href}?${this.searchParams.toString()}`
    }
    return this.href
  }
  static createObjectURL = jest.fn(() => 'blob:url')
  static revokeObjectURL = jest.fn()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

Object.defineProperty(window, 'URL', {
  value: MockURL,
  writable: true,
})

describe('apiClient', () => {
  beforeEach(() => {
    // Important: clear calls + restore spyOn() implementations between tests
    // (clearAllMocks alone does not restore mockImplementation)
    jest.restoreAllMocks()
    jest.clearAllMocks()
    ;(fetch as jest.Mock).mockReset()
  })

  const createSseResponse = (chunks: string[], init?: { ok?: boolean; status?: number; statusText?: string }) => {
    const ok = init?.ok ?? true
    const status = init?.status ?? 200
    const statusText = init?.statusText ?? 'OK'
    const encoder = new TextEncoder()
    const encoded = chunks.map((c) => encoder.encode(c))
    let idx = 0
    const reader = {
      read: jest.fn(async () => {
        if (idx >= encoded.length) {
          return { done: true, value: undefined }
        }
        const value = encoded[idx++]
        return { done: false, value }
      }),
    }

    return {
      ok,
      status,
      statusText,
      body: {
        getReader: () => reader,
      },
    } as unknown as Response
  }

  describe('isAuthenticated', () => {
    it('should return true when authenticated', async () => {
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
      })

      const result = await apiClient.isAuthenticated()
      expect(result).toBe(true)
    })

    it('should return false when not authenticated', async () => {
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
      })

      const result = await apiClient.isAuthenticated()
      expect(result).toBe(false)
    })

    it('should return false on error', async () => {
      ;(fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'))

      const result = await apiClient.isAuthenticated()
      expect(result).toBe(false)
    })
  })

  describe('login', () => {
    it('should login successfully', async () => {
      const mockResponse = { access: 'token', refresh: 'refresh' }
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockResponse),
        json: async () => mockResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      const result = await apiClient.login({ username: 'test', password: 'pass' })
      expect(result).toEqual(mockResponse)
    })
  })

  describe('signup', () => {
    it('should signup successfully', async () => {
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '{}',
        json: async () => ({}),
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      await apiClient.signup({
        username: 'test',
        email: 'test@example.com',
        password: 'password',
      })

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/signup/'),
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        })
      )
    })
  })

  describe('getMe', () => {
    it('should get user data', async () => {
      const mockUser = { id: 1, username: 'testuser' }
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockUser),
        json: async () => mockUser,
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      const result = await apiClient.getMe()
      expect(result).toEqual(mockUser)
    })
  })

  describe('getVideos', () => {
    it('should get videos list', async () => {
      const mockVideos = [
        {
          id: 1,
          title: 'Video 1',
          file: '',
          uploaded_at: '',
          status: 'completed' as const,
          description: '',
        },
      ]
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockVideos),
        json: async () => mockVideos,
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      const result = await apiClient.getVideos()
      expect(result).toEqual(mockVideos)
    })

    it('should handle query parameters', async () => {
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '[]',
        json: async () => [],
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      await apiClient.getVideos({ q: 'test', status: 'completed' })
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('q=test'),
        expect.any(Object)
      )
    })
  })

  describe('getVideo', () => {
    it('should get single video', async () => {
      const mockVideo = {
        id: 1,
        title: 'Video 1',
        user: 1,
        file: '',
        uploaded_at: '',
        status: 'completed' as const,
        description: '',
      }
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockVideo),
        json: async () => mockVideo,
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      const result = await apiClient.getVideo(1)
      expect(result).toEqual(mockVideo)
    })
  })

  describe('uploadVideo', () => {
    it('should upload video', async () => {
      const mockVideo = {
        id: 1,
        title: 'Video 1',
        user: 1,
        file: '',
        uploaded_at: '',
        status: 'pending' as const,
        description: '',
      }
      const file = new File(['content'], 'test.mp4', { type: 'video/mp4' })

      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockVideo),
        json: async () => mockVideo,
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      const result = await apiClient.uploadVideo({
        file,
        title: 'Test Video',
        description: 'Test Description',
      })

      expect(result).toEqual(mockVideo)
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/videos/'),
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData),
        })
      )
    })
  })

  describe('chat', () => {
    it('should send chat message', async () => {
      const mockMessage = {
        role: 'assistant' as const,
        content: 'Response',
      }
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockMessage),
        json: async () => mockMessage,
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      const result = await apiClient.chat({
        messages: [{ role: 'user', content: 'Hello' }],
        group_id: 1,
      })

      expect(result).toEqual(mockMessage)
    })
  })

  describe('getVideoGroups', () => {
    it('should get video groups', async () => {
      const mockGroups = [
        {
          id: 1,
          name: 'Group 1',
          description: '',
          created_at: '',
          video_count: 0,
        },
      ]
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockGroups),
        json: async () => mockGroups,
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      const result = await apiClient.getVideoGroups()
      expect(result).toEqual(mockGroups)
    })
  })

  describe('error handling', () => {
    it('should handle 401 error and retry', async () => {
      const mockUser = { id: 1, username: 'testuser' }
      
      // First call returns 401
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => '{}',
        json: async () => ({}),
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      // Refresh token call
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ access: 'new-token' }),
        json: async () => ({ access: 'new-token' }),
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      // Retry call succeeds
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockUser),
        json: async () => mockUser,
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      const result = await apiClient.getMe()
      expect(result).toEqual(mockUser)
    })

    it('should handle non-401 errors', async () => {
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ detail: 'Server error' }),
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      await expect(apiClient.getMe()).rejects.toThrow()
    })
  })

  describe('verifyEmail', () => {
    it('should verify email', async () => {
      const mockResponse = { detail: 'Email verified' }
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockResponse),
        json: async () => mockResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      const result = await apiClient.verifyEmail({ uid: 'uid123', token: 'token123' })
      expect(result).toEqual(mockResponse)
    })
  })

  describe('requestPasswordReset', () => {
    it('should request password reset', async () => {
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '{}',
        json: async () => ({}),
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      await apiClient.requestPasswordReset({ email: 'test@example.com' })
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/password-reset/'),
        expect.objectContaining({
          method: 'POST',
        })
      )
    })
  })

  describe('confirmPasswordReset', () => {
    it('should confirm password reset', async () => {
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '{}',
        json: async () => ({}),
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      await apiClient.confirmPasswordReset({
        uid: 'uid123',
        token: 'token123',
        new_password: 'newpass123',
      })
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/password-reset/confirm/'),
        expect.objectContaining({
          method: 'POST',
        })
      )
    })
  })

  describe('refreshToken', () => {
    it('should refresh token', async () => {
      const mockResponse = { access: 'new-token' }
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockResponse),
        json: async () => mockResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      const result = await apiClient.refreshToken()
      expect(result).toEqual(mockResponse)
    })
  })

  describe('setChatFeedback', () => {
    it('should set chat feedback', async () => {
      const mockResponse = { chat_log_id: 1, feedback: 'good' as const }
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockResponse),
        json: async () => mockResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      const result = await apiClient.setChatFeedback(1, 'good')
      expect(result).toEqual(mockResponse)
    })

    it('should set chat feedback with share token', async () => {
      const mockResponse = { chat_log_id: 1, feedback: 'bad' as const }
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockResponse),
        json: async () => mockResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      const result = await apiClient.setChatFeedback(1, 'bad', 'share-token')
      expect(result).toEqual(mockResponse)
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('share_token=share-token'),
        expect.any(Object)
      )
    })
  })

  describe('getChatHistory', () => {
    it('should get chat history', async () => {
      const mockHistory = [
        {
          id: 1,
          group: 1,
          question: 'Question',
          answer: 'Answer',
          related_videos: [],
          is_shared_origin: false,
          created_at: '2024-01-15',
        },
      ]
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockHistory),
        json: async () => mockHistory,
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      const result = await apiClient.getChatHistory(1)
      expect(result).toEqual(mockHistory)
    })
  })

  describe('updateVideo', () => {
    it('should update video', async () => {
      const mockVideo = {
        id: 1,
        title: 'Updated Video',
        user: 1,
        file: '',
        uploaded_at: '',
        status: 'completed' as const,
        description: '',
      }
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockVideo),
        json: async () => mockVideo,
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      const result = await apiClient.updateVideo(1, { title: 'Updated Video' })
      expect(result).toEqual(mockVideo)
    })
  })

  describe('deleteVideo', () => {
    it('should delete video', async () => {
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '{}',
        json: async () => ({}),
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      await apiClient.deleteVideo(1)
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/videos/1/'),
        expect.objectContaining({
          method: 'DELETE',
        })
      )
    })
  })

  describe('getVideoGroup', () => {
    it('should get video group', async () => {
      const mockGroup = {
        id: 1,
        name: 'Group 1',
        description: '',
        created_at: '',
        video_count: 0,
      }
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockGroup),
        json: async () => mockGroup,
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      const result = await apiClient.getVideoGroup(1)
      expect(result).toEqual(mockGroup)
    })
  })

  describe('createVideoGroup', () => {
    it('should create video group', async () => {
      const mockGroup = {
        id: 1,
        name: 'New Group',
        description: '',
        created_at: '',
        video_count: 0,
      }
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockGroup),
        json: async () => mockGroup,
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      const result = await apiClient.createVideoGroup({ name: 'New Group' })
      expect(result).toEqual(mockGroup)
    })
  })

  describe('updateVideoGroup', () => {
    it('should update video group', async () => {
      const mockGroup = {
        id: 1,
        name: 'Updated Group',
        description: '',
        created_at: '',
        video_count: 0,
      }
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockGroup),
        json: async () => mockGroup,
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      const result = await apiClient.updateVideoGroup(1, { name: 'Updated Group' })
      expect(result).toEqual(mockGroup)
    })
  })

  describe('deleteVideoGroup', () => {
    it('should delete video group', async () => {
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '{}',
        json: async () => ({}),
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      await apiClient.deleteVideoGroup(1)
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/videos/groups/1/'),
        expect.objectContaining({
          method: 'DELETE',
        })
      )
    })
  })

  describe('addVideoToGroup', () => {
    it('should add video to group', async () => {
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '{}',
        json: async () => ({}),
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      await apiClient.addVideoToGroup(1, 2)
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/videos/groups/1/videos/2/'),
        expect.objectContaining({
          method: 'POST',
        })
      )
    })
  })

  describe('addVideosToGroup', () => {
    it('should add videos to group', async () => {
      const mockResponse = { message: 'Videos added', added_count: 2, skipped_count: 0 }
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockResponse),
        json: async () => mockResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      const result = await apiClient.addVideosToGroup(1, [2, 3])
      expect(result).toEqual(mockResponse)
    })
  })

  describe('removeVideoFromGroup', () => {
    it('should remove video from group', async () => {
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '{}',
        json: async () => ({}),
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      await apiClient.removeVideoFromGroup(1, 2)
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/videos/groups/1/videos/2/remove/'),
        expect.objectContaining({
          method: 'DELETE',
        })
      )
    })
  })

  describe('reorderVideosInGroup', () => {
    it('should reorder videos in group', async () => {
      const mockResponse = { message: 'Videos reordered' }
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockResponse),
        json: async () => mockResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      const result = await apiClient.reorderVideosInGroup(1, [2, 3, 1])
      expect(result).toEqual(mockResponse)
    })
  })

  describe('createShareLink', () => {
    it('should create share link', async () => {
      const mockResponse = { message: 'Share link created', share_token: 'token123' }
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockResponse),
        json: async () => mockResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      const result = await apiClient.createShareLink(1)
      expect(result).toEqual(mockResponse)
    })
  })

  describe('deleteShareLink', () => {
    it('should delete share link', async () => {
      const mockResponse = { message: 'Share link deleted' }
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockResponse),
        json: async () => mockResponse,
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      const result = await apiClient.deleteShareLink(1)
      expect(result).toEqual(mockResponse)
    })
  })

  describe('getSharedGroup', () => {
    it('should get shared group', async () => {
      const mockGroup = {
        id: 1,
        name: 'Shared Group',
        description: '',
        created_at: '',
        video_count: 0,
      }
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockGroup,
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      const result = await apiClient.getSharedGroup('token123')
      expect(result).toEqual(mockGroup)
    })

    it('should handle errors when getting shared group', async () => {
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Not found',
        headers: new Headers(),
      })

      await expect(apiClient.getSharedGroup('invalid-token')).rejects.toThrow('Not found')
    })
  })

  describe('chat with share token', () => {
    it('should send chat message with share token', async () => {
      const mockMessage = {
        role: 'assistant' as const,
        content: 'Response',
      }
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(mockMessage),
        json: async () => mockMessage,
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      const result = await apiClient.chat({
        messages: [{ role: 'user', content: 'Hello' }],
        share_token: 'token123',
      })

      expect(result).toEqual(mockMessage)
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('share_token=token123'),
        expect.any(Object)
      )
    })
  })

  describe('chatStream', () => {
    it('should stream token and done events', async () => {
      const onToken = jest.fn()
      const onDone = jest.fn()
      const onError = jest.fn()

      const related_videos = [{ video_id: 1, title: 't', start_time: '0', end_time: '1' }]

      // Split across chunks to exercise buffer logic
      const response = createSseResponse([
        'data: {"type":"token","content":"Hel"}\n\n',
        'data: {"type":"token","content":"lo"}\n\n',
        `data: {"type":"done","related_videos":${JSON.stringify(related_videos)},"chat_log_id":123,"feedback":null}\n\n`,
      ])

      ;(fetch as jest.Mock).mockResolvedValueOnce(response)

      await apiClient.chatStream(
        { messages: [{ role: 'user', content: 'Hello' }], group_id: 1 },
        onToken,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onDone as any,
        onError
      )

      expect(onToken).toHaveBeenCalledTimes(2)
      expect(onToken).toHaveBeenNthCalledWith(1, 'Hel')
      expect(onToken).toHaveBeenNthCalledWith(2, 'lo')

      expect(onDone).toHaveBeenCalledTimes(1)
      expect(onDone).toHaveBeenCalledWith({
        related_videos,
        chat_log_id: 123,
        feedback: null,
      })
      expect(onError).not.toHaveBeenCalled()
    })

    it('should call onError for server error event (fallback message)', async () => {
      const onToken = jest.fn()
      const onDone = jest.fn()
      const onError = jest.fn()

      const response = createSseResponse([
        'data: {"type":"error"}\n\n',
      ])
      ;(fetch as jest.Mock).mockResolvedValueOnce(response)

      await apiClient.chatStream(
        { messages: [{ role: 'user', content: 'Hello' }], group_id: 1 },
        onToken,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onDone as any,
        onError
      )

      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError.mock.calls[0][0]).toBeInstanceOf(Error)
      expect((onError.mock.calls[0][0] as Error).message).toBe('Unknown server error')
    })

    it('should log and continue on malformed SSE JSON', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      const onToken = jest.fn()
      const onDone = jest.fn()
      const onError = jest.fn()

      const response = createSseResponse([
        'data: not-json\n\n',
        'data: {"type":"done"}\n\n',
      ])
      ;(fetch as jest.Mock).mockResolvedValueOnce(response)

      await apiClient.chatStream(
        { messages: [{ role: 'user', content: 'Hello' }], group_id: 1 },
        onToken,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onDone as any,
        onError
      )

      expect(consoleErrorSpy).toHaveBeenCalled()
      expect(onDone).toHaveBeenCalledTimes(1)
      consoleErrorSpy.mockRestore()
    })

    it('should call onError with Unknown error when fetch throws non-Error', async () => {
      const onToken = jest.fn()
      const onDone = jest.fn()
      const onError = jest.fn()

      ;(fetch as jest.Mock).mockRejectedValueOnce('boom')

      await apiClient.chatStream(
        { messages: [{ role: 'user', content: 'Hello' }], group_id: 1 },
        onToken,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onDone as any,
        onError
      )

      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError.mock.calls[0][0]).toBeInstanceOf(Error)
      expect((onError.mock.calls[0][0] as Error).message).toBe('Unknown error')
    })

    it('should retry once on 401 and then stream', async () => {
      const onToken = jest.fn()
      const onDone = jest.fn()
      const onError = jest.fn()

      // Avoid invoking real refresh flow (which calls this.request -> fetch)
      jest.spyOn(apiClient, 'refreshToken').mockResolvedValue({ access: 'new-token' })

      const first401 = { ok: false, status: 401, statusText: 'Unauthorized' }
      const retryOk = createSseResponse(['data: {"type":"done"}\n\n'])

      ;(fetch as jest.Mock).mockResolvedValueOnce(first401).mockResolvedValueOnce(retryOk)

      await apiClient.chatStream(
        { messages: [{ role: 'user', content: 'Hello' }], group_id: 1 },
        onToken,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onDone as any,
        onError
      )

      expect(fetch).toHaveBeenCalledTimes(2)
      expect(onDone).toHaveBeenCalledTimes(1)
      expect(onError).not.toHaveBeenCalled()
    })

    it('should trigger auth handling when 401 retry fails', async () => {
      const onToken = jest.fn()
      const onDone = jest.fn()
      const onError = jest.fn()

      jest.spyOn(apiClient, 'refreshToken').mockResolvedValue({ access: 'new-token' })
      // jsdom throws on real navigation; stub auth handler instead
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handleAuthErrorSpy = jest.spyOn(apiClient as any, 'handleAuthError').mockImplementation(async () => {
        throw new Error('Authentication failed')
      })

      const first401 = { ok: false, status: 401, statusText: 'Unauthorized' }
      const retryForbidden = { ok: false, status: 403, statusText: 'Forbidden' }
      ;(fetch as jest.Mock).mockResolvedValueOnce(first401).mockResolvedValueOnce(retryForbidden)

      await apiClient.chatStream(
        { messages: [{ role: 'user', content: 'Hello' }], group_id: 1 },
        onToken,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onDone as any,
        onError
      )

      expect(onError).toHaveBeenCalledTimes(1)
      expect(handleAuthErrorSpy).toHaveBeenCalledTimes(1)
      expect((onError.mock.calls[0][0] as Error).message).toBe('Authentication failed')
      handleAuthErrorSpy.mockRestore()
    })

    it('processStreamResponse should throw when body is not readable', async () => {
      const onToken = jest.fn()
      const onDone = jest.fn()
      const onError = jest.fn()

      const response = { ok: true, status: 200, statusText: 'OK', body: undefined } as unknown as Response
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (apiClient as any).processStreamResponse(response, onToken, onDone, onError)
      ).rejects.toThrow('Response body is not readable')
    })
  })

  describe('exportChatHistoryCsv', () => {
    it('should export chat history as CSV', async () => {
      const mockBlob = new Blob(['csv content'], { type: 'text/csv' })
      const mockLink = {
        click: jest.fn(),
        href: '',
        download: '',
      }
      
      ;(document.createElement as jest.Mock).mockReturnValue(mockLink)
      ;(window.URL.createObjectURL as jest.Mock).mockReturnValue('blob:url')

      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        blob: async () => mockBlob,
        headers: new Headers({
          'Content-Disposition': 'attachment; filename="chat_history.csv"',
        }),
      })

      await apiClient.exportChatHistoryCsv(1)

      expect(fetch).toHaveBeenCalled()
      expect(mockLink.click).toHaveBeenCalled()
      expect(mockLink.download).toBe('chat_history.csv')
    })

    it('should handle 401 error and retry', async () => {
      const mockBlob = new Blob(['csv content'], { type: 'text/csv' })
      const mockLink = {
        click: jest.fn(),
        href: '',
        download: '',
      }
      
      ;(document.createElement as jest.Mock).mockReturnValue(mockLink)
      ;(window.URL.createObjectURL as jest.Mock).mockReturnValue('blob:url')

      // First call returns 401
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
      })

      // Refresh token call
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ access: 'new-token' }),
        json: async () => ({ access: 'new-token' }),
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      // Retry call succeeds
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        blob: async () => mockBlob,
        headers: new Headers({
          'Content-Disposition': 'attachment; filename="chat_history.csv"',
        }),
      })

      await apiClient.exportChatHistoryCsv(1)

      expect(fetch).toHaveBeenCalledTimes(3)
    })

    it('should use default filename when Content-Disposition is missing', async () => {
      const mockBlob = new Blob(['csv content'], { type: 'text/csv' })
      const mockLink = {
        click: jest.fn(),
        href: '',
        download: '',
      }
      
      ;(document.createElement as jest.Mock).mockReturnValue(mockLink)
      ;(window.URL.createObjectURL as jest.Mock).mockReturnValue('blob:url')

      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        blob: async () => mockBlob,
        headers: new Headers({}),
      })

      await apiClient.exportChatHistoryCsv(1)

      expect(mockLink.download).toBe('chat_history_group_1.csv')
    })
  })

  describe('getSharedVideoUrl', () => {
    it('should build shared video URL', () => {
      const url = apiClient.getSharedVideoUrl('/media/video.mp4', 'token123')
      expect(url).toBeDefined()
      expect(url).toContain('share_token=token123')
    })
  })

  describe('logout', () => {
    it('should handle logout errors silently', async () => {
      ;(fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'))
      
      // Should not throw
      await expect(apiClient.logout()).resolves.toBeUndefined()
    })
  })

  describe('error handling', () => {
    it('should handle error response with detail field', async () => {
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ detail: 'Error detail message' }),
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      await expect(apiClient.getMe()).rejects.toThrow('Error detail message')
    })

    it('should handle error response with message field', async () => {
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Error message' }),
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      await expect(apiClient.getMe()).rejects.toThrow('Error message')
    })

    it('should handle error response without detail or message', async () => {
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      await expect(apiClient.getMe()).rejects.toThrow('HTTP error! status: 500')
    })

    it('should handle non_field_errors array (DRF validation errors)', async () => {
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ non_field_errors: ['Invalid credentials'] }),
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      await expect(apiClient.getMe()).rejects.toThrow('Invalid credentials')
    })

    it('should handle field-specific errors (first message only)', async () => {
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ username: ['Username is required'] }),
        headers: new Headers({ 'content-type': 'application/json' }),
      })

      await expect(apiClient.getMe()).rejects.toThrow('Username is required')
    })
  })

  describe('401 handling (second 401 triggers auth failure)', () => {
    it('should redirect to login when repeated 401 occurs after retry', async () => {
      jest.spyOn(apiClient, 'refreshToken').mockResolvedValue({ access: 'new-token' })
      // jsdom throws on real navigation; stub auth handler instead
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handleAuthErrorSpy = jest.spyOn(apiClient as any, 'handleAuthError').mockImplementation(async () => {
        throw new Error('Authentication failed')
      })

      ;(fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized', headers: new Headers(), text: async () => '' })
        .mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized', headers: new Headers(), text: async () => '' })

      await expect(apiClient.getMe()).rejects.toThrow('Authentication failed')
      // Called twice due to handle401Error retry wrapper + second 401 branch
      expect(handleAuthErrorSpy).toHaveBeenCalledTimes(2)
      handleAuthErrorSpy.mockRestore()
    })
  })

  describe('parseJsonResponse edge cases', () => {
    it('should return empty object when content-length is 0', async () => {
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': '0' }),
        text: async () => '',
      })

      const result = await apiClient.getMe()
      expect(result).toEqual({})
    })

    it('should return empty object when response is not JSON and has no content-length', async () => {
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => '',
      })

      const result = await apiClient.getMe()
      expect(result).toEqual({})
    })

    it('should return empty object when text is empty', async () => {
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => '',
      })

      const result = await apiClient.getMe()
      expect(result).toEqual({})
    })

    it('should return empty object when JSON parse fails', async () => {
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => 'invalid json',
      })

      const result = await apiClient.getMe()
      expect(result).toEqual({})
    })
  })

  describe('exportChatHistoryCsv error handling', () => {
    it('should handle 401 error with refresh token failure', async () => {
      // First call returns 401
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
      })

      // Refresh token call fails
      ;(fetch as jest.Mock).mockRejectedValueOnce(new Error('Refresh failed'))

      await expect(apiClient.exportChatHistoryCsv(1)).rejects.toThrow()
    })

    it('should handle non-ok response with error message', async () => {
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error message',
        headers: new Headers(),
      })

      await expect(apiClient.exportChatHistoryCsv(1)).rejects.toThrow('Server error message')
    })

    it('should handle non-ok response without error message', async () => {
      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => '',
      })

      await expect(apiClient.exportChatHistoryCsv(1)).rejects.toThrow('Failed to export CSV: Internal Server Error')
    })
  })

  describe('uploadVideo error handling', () => {
    it('should log error and rethrow on upload failure', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      const file = new File(['test'], 'test.mp4', { type: 'video/mp4' })

      ;(fetch as jest.Mock).mockRejectedValueOnce(new Error('Upload failed'))

      await expect(apiClient.uploadVideo({
        file,
        title: 'Test Video',
      })).rejects.toThrow('Upload failed')
      expect(consoleErrorSpy).toHaveBeenCalled()

      consoleErrorSpy.mockRestore()
    })
  })
})

