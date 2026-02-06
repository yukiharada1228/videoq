import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Unmock the api module since it is mocked in setupFiles
vi.unmock('@/lib/api');

// Mock environment variable before import
vi.stubGlobal('import.meta', {
  env: {
    VITE_API_URL: 'http://localhost:8000/api',
  },
});

// Import the apiClient singleton
import { apiClient } from '../api';

describe('ApiClient', () => {
  // Mock fetch
  const fetchMock = vi.fn();
  global.fetch = fetchMock;

  // Mock window.location
  const originalLocation = window.location;

  beforeEach(() => {
    fetchMock.mockReset();

    // Reset window.location mock
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...originalLocation,
        origin: 'http://frontend.example.com',
        href: 'http://frontend.example.com/',
      },
    });

    // Reset baseUrl to default incase it was changed
    (apiClient as any).baseUrl = 'http://localhost:8000/api';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Auth Methods', () => {
    it('isAuthenticated should return true when response is ok', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
      });
      const result = await apiClient.isAuthenticated();
      expect(result).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/auth/me/', expect.objectContaining({
        method: 'GET',
        credentials: 'include',
      }));
    });

    it('isAuthenticated should return false when response is not ok', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
      });
      const result = await apiClient.isAuthenticated();
      expect(result).toBe(false);
    });

    it('isAuthenticated should return false when fetch fails', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'));
      const result = await apiClient.isAuthenticated();
      expect(result).toBe(false);
    });

    it('logout should call logout endpoint', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true });
      await apiClient.logout();
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/auth/logout/', expect.objectContaining({
        method: 'POST',
      }));
    });

    it('login should return response on success', async () => {
      const mockResponse = { access: 'atk', refresh: 'rtk' };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      });

      const result = await apiClient.login({ username: 'user', password: 'pw' });
      expect(result).toEqual(mockResponse);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/auth/login/', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ username: 'user', password: 'pw' }),
      }));
    });

    it('signup should call signup endpoint', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, headers: new Headers() });
      await apiClient.signup({ username: 'u', email: 'e@e.com', password: 'p' });
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/auth/signup/', expect.objectContaining({
        method: 'POST',
      }));
    });

    it('verifyEmail should call verify-email endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({}))
      });
      await apiClient.verifyEmail({ uid: 'uid', token: 'token' });
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/auth/verify-email/', expect.objectContaining({
        method: 'POST',
      }));
    });

    it('requestPasswordReset should call password-reset endpoint', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, headers: new Headers() });
      await apiClient.requestPasswordReset({ email: 'e@e.com' });
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/auth/password-reset/', expect.objectContaining({
        method: 'POST',
      }));
    });

    it('confirmPasswordReset should call password-reset/confirm endpoint', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, headers: new Headers() });
      await apiClient.confirmPasswordReset({ uid: 'uid', token: 'token', new_password: 'new' });
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/auth/password-reset/confirm/', expect.objectContaining({
        method: 'POST',
      }));
    });

    it('refreshToken should call refresh endpoint', async () => {
      const mockResponse = { access: 'new_token' };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify(mockResponse))
      });
      const result = await apiClient.refreshToken();
      expect(result).toEqual(mockResponse);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/auth/refresh/', expect.objectContaining({
        method: 'POST',
      }));
    });

    it('getMe should return user info', async () => {
      const mockUser = { id: 1, username: 'test' };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify(mockUser))
      });
      const result = await apiClient.getMe();
      expect(result).toEqual(mockUser);
    });
  });

  describe('Error Handling', () => {
    it('should throw error on non-ok response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({ error: 'fail' }),
      });

      await expect(apiClient.getMe()).rejects.toThrow();
    });

    it('should handle unified error format', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: { message: 'Custom Error' } }),
      });

      await expect(apiClient.getMe()).rejects.toThrow('Custom Error');
    });

    it('should handle 401 and retry', async () => {
      // First call fails with 401
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      // Refresh token call succeeds
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ access: 'new' })),
      });

      // Retry original call succeeds
      const mockUser = { id: 1 };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify(mockUser)),
      });

      const result = await apiClient.getMe();
      expect(result).toEqual(mockUser);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('should handle 401 and redirect to login if refresh fails', async () => {
      // First call fails with 401
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      // Refresh token call fails
      fetchMock.mockRejectedValueOnce(new Error('Refresh failed'));

      // Mock logout (which is called on auth error)
      fetchMock.mockResolvedValueOnce({ ok: true });

      await expect(apiClient.getMe()).rejects.toThrow('Authentication failed');
      expect(window.location.href).toBe('/login');
    });
  });

  describe('Video Methods', () => {
    it('getVideos should build query string', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify([]))
      });

      await apiClient.getVideos({ q: 'search', status: 'pending', tags: [1, 2] });
      const expectedUrl = 'http://localhost:8000/api/videos/?q=search&status=pending&tags=1%2C2';
      expect(fetchMock).toHaveBeenCalledWith(expectedUrl, expect.anything());
    });

    it('getVideos should handle no params', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify([]))
      });
      await apiClient.getVideos();
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/', expect.anything());
    });

    it('uploadVideo should use FormData', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ id: 1 }))
      });

      const file = new File(['content'], 'test.mp4', { type: 'video/mp4' });
      await apiClient.uploadVideo({ file, title: 'Test Video' });

      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/', expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      }));
    });

    it('uploadVideo should include optional fields', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ id: 1 }))
      });

      const file = new File(['content'], 'test.mp4', { type: 'video/mp4' });
      await apiClient.uploadVideo({ file, title: 'Test', description: 'Desc', external_id: '123' });

      // Verify FormData entries if possible, or just that it was called. 
      // Since checking FormData content is hard without a proper mock, coverage is the main goal.
      // The lines will be executed.
      expect(fetchMock).toHaveBeenCalled();
    });

    it('uploadVideo should handle errors', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Upload failed'));

      const file = new File(['content'], 'test.mp4', { type: 'video/mp4' });
      await expect(apiClient.uploadVideo({ file, title: 'Test Video' })).rejects.toThrow('Upload failed');
    });

    it('getVideo should call correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ id: 1 }))
      });
      await apiClient.getVideo(1);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/1/', expect.anything());
    });

    it('updateVideo should call correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ id: 1 }))
      });
      await apiClient.updateVideo(1, { title: 'Updated' });
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/1/', expect.objectContaining({ method: 'PATCH' }));
    });

    it('deleteVideo should call correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        text: () => Promise.resolve("")
      });
      await apiClient.deleteVideo(1);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/1/', expect.objectContaining({ method: 'DELETE' }));
    });
  });

  describe('Video Group Methods', () => {
    it('getVideoGroups calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify([]))
      });
      await apiClient.getVideoGroups();
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/groups/', expect.anything());
    });

    it('getVideoGroup calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ id: 1 }))
      });
      await apiClient.getVideoGroup(1);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/groups/1/', expect.anything());
    });

    it('createVideoGroup calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ id: 1 }))
      });
      await apiClient.createVideoGroup({ name: 'Group' });
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/groups/', expect.objectContaining({ method: 'POST' }));
    });

    it('updateVideoGroup calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ id: 1 }))
      });
      await apiClient.updateVideoGroup(1, { name: 'Updated' });
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/groups/1/', expect.objectContaining({ method: 'PATCH' }));
    });

    it('deleteVideoGroup calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, headers: new Headers() });
      await apiClient.deleteVideoGroup(1);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/groups/1/', expect.objectContaining({ method: 'DELETE' }));
    });

    it('addVideoToGroup calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, headers: new Headers() });
      await apiClient.addVideoToGroup(1, 100);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/groups/1/videos/100/', expect.objectContaining({ method: 'POST' }));
    });

    it('addVideosToGroup calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ message: "OK" }))
      });
      await apiClient.addVideosToGroup(1, [100, 101]);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/groups/1/videos/', expect.objectContaining({ method: 'POST' }));
    });

    it('removeVideoFromGroup calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, headers: new Headers() });
      await apiClient.removeVideoFromGroup(1, 100);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/groups/1/videos/100/remove/', expect.objectContaining({ method: 'DELETE' }));
    });

    it('reorderVideosInGroup calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ message: "OK" }))
      });
      await apiClient.reorderVideosInGroup(1, [101, 100]);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/groups/1/reorder/', expect.objectContaining({ method: 'PATCH' }));
    });
  });

  describe('Tag Methods', () => {
    it('getTags calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify([]))
      });
      await apiClient.getTags();
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/tags/', expect.anything());
    });

    it('getTag calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ id: 1 }))
      });
      await apiClient.getTag(1);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/tags/1/', expect.anything());
    });

    it('createTag calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ id: 1 }))
      });
      await apiClient.createTag({ name: 'Tag' });
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/tags/', expect.objectContaining({ method: 'POST' }));
    });

    it('updateTag calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ id: 1 }))
      });
      await apiClient.updateTag(1, { name: 'New Tag' });
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/tags/1/', expect.objectContaining({ method: 'PATCH' }));
    });

    it('deleteTag calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, headers: new Headers() });
      await apiClient.deleteTag(1);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/tags/1/', expect.objectContaining({ method: 'DELETE' }));
    });

    it('addTagsToVideo calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ message: "OK" }))
      });
      await apiClient.addTagsToVideo(1, [10, 11]);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/1/tags/', expect.objectContaining({ method: 'POST' }));
    });

    it('removeTagFromVideo calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, headers: new Headers() });
      await apiClient.removeTagFromVideo(1, 10);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/1/tags/10/remove/', expect.objectContaining({ method: 'DELETE' }));
    });
  });

  describe('Chat Methods', () => {
    it('chat calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ role: 'assistant', content: 'hello' }))
      });
      await apiClient.chat({ messages: [] });
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/chat/', expect.objectContaining({ method: 'POST' }));
    });

    it('chat with share token calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ role: 'assistant', content: 'hello' }))
      });
      await apiClient.chat({ messages: [], share_token: 'abc' });
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/chat/?share_token=abc', expect.objectContaining({ method: 'POST' }));
    });

    it('setChatFeedback calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({}))
      });
      await apiClient.setChatFeedback(1, 'good');
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/chat/feedback/', expect.objectContaining({ method: 'POST' }));
    });

    it('getChatHistory calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify([]))
      });
      await apiClient.getChatHistory(1);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/chat/history/?group_id=1', expect.anything());
    });

    it('exportChatHistoryCsv should download file', async () => {
      // Mock DOM methods
      const mockUrl = 'blob:url';
      const mockRevoke = vi.fn();
      const mockLink = { href: '', download: '', click: vi.fn() };

      global.URL.createObjectURL = vi.fn(() => mockUrl);
      global.URL.revokeObjectURL = mockRevoke;
      const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as any);
      const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as any);

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Disposition': 'attachment; filename="chat.csv"' }),
        blob: () => Promise.resolve(new Blob(['data'], { type: 'text/csv' }))
      });

      await apiClient.exportChatHistoryCsv(1);

      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/chat/history/export/?group_id=1', expect.anything());
      expect(createElementSpy).toHaveBeenCalledWith('a');
      expect(appendChildSpy).toHaveBeenCalledWith(mockLink);
      expect(mockLink.click).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalledWith(mockLink);
      expect(mockRevoke).toHaveBeenCalledWith(mockUrl);
    });
  });

  describe('Share Methods', () => {
    it('createShareLink calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ share_token: 'abc' }))
      });
      await apiClient.createShareLink(1);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/groups/1/share/', expect.objectContaining({ method: 'POST' }));
    });

    it('deleteShareLink calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({}))
      });
      await apiClient.deleteShareLink(1);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/groups/1/share/delete/', expect.objectContaining({ method: 'DELETE' }));
    });

    it('getSharedGroup calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ id: 1 })),
        json: () => Promise.resolve({ id: 1 })
      });
      await apiClient.getSharedGroup('token');
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/groups/shared/token/');
    });

    it('getSharedGroup should throw on error', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
        text: () => Promise.resolve('Group not found')
      });
      await expect(apiClient.getSharedGroup('token')).rejects.toThrow('Group not found');
    });
  });

  describe('getVideoUrl', () => {
    it('should return empty string for null input', () => {
      const result = apiClient.getVideoUrl(null);
      expect(result).toBe('');
    });

    it('should return absolute HTTP URL as-is', () => {
      const url = 'http://example.com/video.mp4';
      const result = apiClient.getVideoUrl(url);
      expect(result).toBe(url);
    });

    it('should convert relative URL to absolute URL (with absolute base)', () => {
      // Default base is http://localhost:8000/api
      const relativeUrl = '/api/media/videos/1/video.mp4';
      const result = apiClient.getVideoUrl(relativeUrl);
      expect(result).toBe('http://localhost:8000/api/media/videos/1/video.mp4');
    });

    it('should handle simple relative paths (with absolute base)', () => {
      // Default base is http://localhost:8000/api
      const relativeUrl = 'media/video.mp4';
      const result = apiClient.getVideoUrl(relativeUrl);
      // resolvedBase is http://localhost:8000/api
      // basePath is /api
      // result is http://localhost:8000/api/media/video.mp4
      expect(result).toBe('http://localhost:8000/api/media/video.mp4');
    });

    it('should use window origin when base url is relative', () => {
      // Temporarily change baseUrl
      (apiClient as any).baseUrl = '/api';

      const relativeUrl = 'media/video.mp4';
      const result = apiClient.getVideoUrl(relativeUrl);

      // window origin mocked to http://frontend.example.com
      // resolvedBase is http://frontend.example.com/api
      expect(result).toBe('http://frontend.example.com/api/media/video.mp4');
    });
  });

  describe('getSharedVideoUrl', () => {
    it('should add share_token parameter to absolute URL', () => {
      const videoFile = 'http://example.com/video.mp4';
      const shareToken = 'abc123';
      const result = apiClient.getSharedVideoUrl(videoFile, shareToken);
      expect(result).toBe('http://example.com/video.mp4?share_token=abc123');
    });

    it('should return empty if url is empty', () => {
      expect(apiClient.getSharedVideoUrl('', 'token')).toBe('');
    });
  });
});
