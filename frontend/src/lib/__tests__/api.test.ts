import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Unmock the api module since it is mocked in setupFiles
vi.unmock('@/lib/api');

// Mock environment variable before import
vi.stubGlobal('import.meta', {
  env: {
    VITE_API_URL: 'http://localhost:8000/api',
  },
});

const { authClientMock, fetchAuthSessionMock } = vi.hoisted(() => {
  const ok = <T,>(data: T = {} as T) => Promise.resolve({ data, error: null });
  const authClientMock = {
    signOut: vi.fn(() => ok()),
    getSession: vi.fn(() => ok({ user: { id: '1', name: 'user' } })),
    signIn: {
      username: vi.fn(() => ok()),
      social: vi.fn(() => ok()),
    },
    signUp: {
      email: vi.fn(() => ok()),
    },
    verifyEmail: vi.fn(() => ok()),
    requestPasswordReset: vi.fn(() => ok()),
    resetPassword: vi.fn(() => ok()),
    changeEmail: vi.fn(() => ok()),
    oauth2: {
      getConsents: vi.fn(() =>
        ok([
          {
            id: 'consent-1',
            clientId: 'mcp-client',
            scopes: ['openid', 'profile'],
            createdAt: new Date('2026-03-02T00:00:00Z'),
          },
        ]),
      ),
      deleteConsent: vi.fn(() => ok()),
      publicClient: vi.fn(() => ok({ client_name: 'MCP Client' })),
    },
    apiKey: {
      list: vi.fn(() =>
        ok({
          apiKeys: [
            {
              id: '1',
              name: 'integration',
              start: 'vq_123',
              lastRequest: null,
              createdAt: '2026-03-02T00:00:00Z',
              metadata: { accessLevel: 'all' },
            },
          ],
        }),
      ),
      create: vi.fn(() =>
        ok({
          id: '1',
          name: 'integration',
          start: 'vq_123',
          createdAt: '2026-03-02T00:00:00Z',
          key: 'vq_secret',
        }),
      ),
      delete: vi.fn(() => ok()),
    },
  };
  const fetchAuthSessionMock = vi.fn(() => ok({ user: { id: '1', name: 'user' } }));
  return { authClientMock, fetchAuthSessionMock };
});

vi.mock('@/lib/auth-client', () => ({
  AUTH_BASE_URL: 'http://localhost:8000',
  authClient: authClientMock,
}));

vi.mock('@/lib/authSession', () => ({
  useAuthSession: () => ({
    data: { user: { id: '1', name: 'user' } },
    isPending: false,
    isRefetching: false,
    error: null,
    refetch: vi.fn(),
  }),
  fetchAuthSession: fetchAuthSessionMock,
}));

// Import the apiClient singleton
import { apiClient, apiPath, createApiClient } from '../api';

describe('apiPath', () => {
  it('strips trailing slashes while preserving query strings', () => {
    expect(apiPath('/videos/1/')).toBe('/videos/1');
    expect(apiPath('/chat/messages/?share_slug=abc')).toBe('/chat/messages?share_slug=abc');
    expect(apiPath('/')).toBe('/');
  });
});

describe('ApiClient', () => {
  // Mock fetch
  const fetchMock = vi.fn();
  global.fetch = fetchMock;

  // Mock window.location
  const originalLocation = window.location;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.clearAllMocks();
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
    it('isAuthenticated should return true when BA session has a user', async () => {
      fetchAuthSessionMock.mockResolvedValueOnce({
        data: { user: { id: '1', name: 'user' } },
        error: null,
      });
      const result = await apiClient.isAuthenticated();
      expect(result).toBe(true);
      expect(fetchAuthSessionMock).toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('isAuthenticated should return false when BA session is absent', async () => {
      fetchAuthSessionMock.mockResolvedValueOnce({ data: null, error: null });
      const result = await apiClient.isAuthenticated();
      expect(result).toBe(false);
    });

    it('logout should call Better Auth signOut', async () => {
      await apiClient.logout();
      expect(authClientMock.signOut).toHaveBeenCalledTimes(1);
    });

    it('login should sign in via Better Auth username plugin', async () => {
      const result = await apiClient.login({ username: 'user', password: 'pw' });
      expect(result).toBeUndefined();
      expect(authClientMock.signIn.username).toHaveBeenCalledWith({
        username: 'user',
        password: 'pw',
      });
    });

    it('loginWithGoogle should call Better Auth social sign-in', async () => {
      await apiClient.loginWithGoogle('/videos');
      expect(authClientMock.signIn.social).toHaveBeenCalledWith({
        provider: 'google',
        callbackURL: '/videos',
      });
    });

    it('login should rely on cookie session for subsequent API requests', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ id: 1 })),
      });

      await apiClient.login({ username: 'user', password: 'pw' });
      await apiClient.getMe();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/account/me', expect.objectContaining({
        credentials: 'include',
        headers: expect.not.objectContaining({ Authorization: expect.anything() }),
      }));
    });

    it('signup should call Better Auth signUp.email', async () => {
      await apiClient.signup({ username: 'u', email: 'e@e.com', password: 'p' });
      expect(authClientMock.signUp.email).toHaveBeenCalledWith({
        email: 'e@e.com',
        password: 'p',
        name: 'u',
        username: 'u',
      });
    });

    it('verifyEmail should call Better Auth verifyEmail', async () => {
      await apiClient.verifyEmail({ token: 'opaque/token' });
      expect(authClientMock.verifyEmail).toHaveBeenCalledWith({
        query: { token: 'opaque/token' },
      });
    });

    it('requestPasswordReset should call Better Auth requestPasswordReset', async () => {
      await apiClient.requestPasswordReset({ email: 'e@e.com' });
      expect(authClientMock.requestPasswordReset).toHaveBeenCalledWith({
        email: 'e@e.com',
        redirectTo: 'http://frontend.example.com/reset-password',
      });
    });

    it('confirmPasswordReset should call Better Auth resetPassword', async () => {
      await apiClient.confirmPasswordReset({ token: 'opaque-token', new_password: 'new' });
      expect(authClientMock.resetPassword).toHaveBeenCalledWith({
        token: 'opaque-token',
        newPassword: 'new',
      });
    });

    it('requestEmailChange should call Better Auth changeEmail with callback', async () => {
      await apiClient.requestEmailChange({ email: 'new@example.com' });
      expect(authClientMock.changeEmail).toHaveBeenCalledWith({
        newEmail: 'new@example.com',
        callbackURL: 'http://frontend.example.com/change-email',
      });
    });

    it('confirmEmailChange should verify via Better Auth', async () => {
      await apiClient.confirmEmailChange({ token: 'opaque-token' });
      expect(authClientMock.verifyEmail).toHaveBeenCalledWith({
        query: { token: 'opaque-token' },
      });
    });

    it('getAuthorizedOAuthTokens should map Better Auth consents', async () => {
      const result = await apiClient.getAuthorizedOAuthTokens();
      expect(result).toEqual([
        {
          id: 'consent-1',
          client_id: 'mcp-client',
          client_name: 'MCP Client',
          scope: 'openid profile',
          issued_at: '2026-03-02T00:00:00.000Z',
          expires_at: null,
        },
      ]);
      expect(authClientMock.oauth2.getConsents).toHaveBeenCalledTimes(1);
    });

    it('revokeAuthorizedOAuthToken should delete Better Auth consent', async () => {
      await apiClient.revokeAuthorizedOAuthToken('consent-1');
      expect(authClientMock.oauth2.deleteConsent).toHaveBeenCalledWith({ id: 'consent-1' });
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
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/account/me', expect.objectContaining({
        credentials: 'include',
      }));
    });

    it('getMeOrNull should return null on 401 without refresh retry', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve('{}'),
      });

      const result = await apiClient.getMeOrNull();

      expect(result).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/api/account/me',
        expect.objectContaining({ credentials: 'include' }),
      );
    });

    it('getIntegrationApiKeys should map Better Auth api keys', async () => {
      const result = await apiClient.getIntegrationApiKeys();

      expect(result).toEqual([{
        id: '1',
        name: 'integration',
        access_level: 'all',
        prefix: 'vq_123',
        last_used_at: null,
        created_at: '2026-03-02T00:00:00Z',
      }]);
      expect(authClientMock.apiKey.list).toHaveBeenCalledTimes(1);
    });

    it('createIntegrationApiKey should create via Better Auth apiKey plugin', async () => {
      const result = await apiClient.createIntegrationApiKey({ name: 'integration', access_level: 'all' });

      expect(result).toEqual({
        id: '1',
        name: 'integration',
        access_level: 'all',
        prefix: 'vq_123',
        last_used_at: null,
        created_at: '2026-03-02T00:00:00Z',
        api_key: 'vq_secret',
      });
      expect(authClientMock.apiKey.create).toHaveBeenCalledWith({
        name: 'integration',
        prefix: 'vq_',
        metadata: { accessLevel: 'all' },
      });
    });

    it('revokeIntegrationApiKey should delete via Better Auth apiKey plugin', async () => {
      await apiClient.revokeIntegrationApiKey(1);
      expect(authClientMock.apiKey.delete).toHaveBeenCalledWith({ keyId: '1' });
    });

    it('getSearchApiKeyStatus should return status', async () => {
      const mockStatus = { has_api_key: true };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify(mockStatus)),
      });

      const result = await apiClient.getSearchApiKeyStatus();

      expect(result).toEqual(mockStatus);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/account/searchapi-key', expect.objectContaining({
        credentials: 'include',
      }));
    });

    it('saveSearchApiKey should save a key', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, headers: new Headers() });

      await apiClient.saveSearchApiKey('sa_test');

      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/account/searchapi-key', expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ api_key: 'sa_test' }),
      }));
    });

    it('deleteSearchApiKey should delete a key', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, headers: new Headers() });

      await apiClient.deleteSearchApiKey();

      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/account/searchapi-key', expect.objectContaining({
        method: 'DELETE',
      }));
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

    it('should handle 401 by signing out and calling onUnauthorized', async () => {
      const onUnauthorized = vi.fn();
      const client = createApiClient({
        baseUrl: 'http://localhost:8000/api',
        fetchFn: fetchMock,
        onUnauthorized,
      });

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await expect(client.getMe()).rejects.toThrow('Authentication failed');
      expect(authClientMock.signOut).toHaveBeenCalledTimes(1);
      expect(onUnauthorized).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('createApiClient should inject baseUrl and fetch implementation', async () => {
      const customFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ id: 1, username: 'custom' })),
      });
      const client = createApiClient({
        baseUrl: 'https://api.example.test/v1',
        fetchFn: customFetch,
      });

      const result = await client.getMe();

      expect(result).toEqual({ id: 1, username: 'custom' });
      expect(customFetch).toHaveBeenCalledWith(
        'https://api.example.test/v1/account/me',
        expect.objectContaining({
          credentials: 'include',
        }),
      );
    });

    it('setUnauthorizedHandler should update the handler used by later auth failures', async () => {
      const firstHandler = vi.fn();
      const secondHandler = vi.fn();
      const client = createApiClient({
        baseUrl: 'http://localhost:8000/api',
        fetchFn: fetchMock,
        onUnauthorized: firstHandler,
      });
      client.setUnauthorizedHandler(secondHandler);

      fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });

      await expect(client.getMe()).rejects.toThrow('Authentication failed');

      expect(firstHandler).not.toHaveBeenCalled();
      expect(secondHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Video Methods', () => {
    it('getVideos should build query string', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ data: [], meta: { total: 0, limit: 24, offset: 0 } }))
      });

      await apiClient.getVideos({ q: 'search', status: 'pending', tags: [1, 2] });
      const expectedUrl = 'http://localhost:8000/api/videos?q=search&status=pending&tags=1%2C2';
      expect(fetchMock).toHaveBeenCalledWith(expectedUrl, expect.anything());
    });

    it('getVideos should handle no params', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ data: [], meta: { total: 0, limit: 24, offset: 0 } }))
      });
      await apiClient.getVideos();
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos', expect.anything());
    });

    it('uploadVideo should use FormData when S3 is disabled', async () => {
      const mockVideo = { id: 1, title: 'Test Video' };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockVideo),
        text: () => Promise.resolve(JSON.stringify(mockVideo)),
      });

      const file = new File(['content'], 'test.mp4', { type: 'video/mp4' });
      const result = await apiClient.uploadVideo({ file, title: 'Test Video' });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/videos'),
        expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
      );
      expect(result).toEqual(mockVideo);
    });

    it('uploadVideo should include optional fields', async () => {
      const mockVideo = { id: 1, title: 'Test' };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(mockVideo),
        text: () => Promise.resolve(JSON.stringify(mockVideo)),
      });

      const file = new File(['content'], 'test.mp4', { type: 'video/mp4' });
      await apiClient.uploadVideo({ file, title: 'Test', description: 'Desc' });

      const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
      const body = lastCall[1]?.body as FormData;
      expect(body).toBeInstanceOf(FormData);
      expect(body.get('description')).toBe('Desc');
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
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/1', expect.anything());
    });

    it('updateVideo should call correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ id: 1 }))
      });
      await apiClient.updateVideo(1, { title: 'Updated' });
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/1', expect.objectContaining({ method: 'PATCH' }));
    });

    it('deleteVideo should call correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        text: () => Promise.resolve("")
      });
      await apiClient.deleteVideo(1);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/1', expect.objectContaining({ method: 'DELETE' }));
    });
  });

  describe('Video Group Methods', () => {
    it('getVideoGroups calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ data: [], meta: { total: 0, limit: 24, offset: 0 } }))
      });
      await apiClient.getVideoGroups();
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/groups', expect.anything());
    });

    it('getVideoGroupsPage calls correct endpoint with pagination params', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ data: [], meta: { total: 0, limit: 24, offset: 0 } }))
      });
      await apiClient.getVideoGroupsPage({ limit: 24, offset: 48 });
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/groups?limit=24&offset=48', expect.anything());
    });

    it('getVideoGroup calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ id: 1 }))
      });
      await apiClient.getVideoGroup(1);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/groups/1', expect.anything());
    });

    it('createVideoGroup calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ id: 1 }))
      });
      await apiClient.createVideoGroup({ name: 'Group' });
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/groups', expect.objectContaining({ method: 'POST' }));
    });

    it('updateVideoGroup calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ id: 1 }))
      });
      await apiClient.updateVideoGroup(1, { name: 'Updated' });
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/groups/1', expect.objectContaining({ method: 'PATCH' }));
    });

    it('deleteVideoGroup calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, headers: new Headers() });
      await apiClient.deleteVideoGroup(1);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/groups/1', expect.objectContaining({ method: 'DELETE' }));
    });

    it('reorderVideoGroups calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ message: "OK" }))
      });
      await apiClient.reorderVideoGroups([2, 1]);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/groups/order', expect.objectContaining({ method: 'PATCH' }));
    });

    it('addVideoToGroup calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, headers: new Headers() });
      await apiClient.addVideoToGroup(1, 100);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/groups/1/videos/100', expect.objectContaining({ method: 'POST' }));
    });

    it('addVideosToGroup calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ message: "OK" }))
      });
      await apiClient.addVideosToGroup(1, [100, 101]);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/groups/1/videos', expect.objectContaining({ method: 'POST' }));
    });

    it('removeVideoFromGroup calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, headers: new Headers() });
      await apiClient.removeVideoFromGroup(1, 100);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/groups/1/videos/100', expect.objectContaining({ method: 'DELETE' }));
    });

    it('reorderVideosInGroup calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ message: "OK" }))
      });
      await apiClient.reorderVideosInGroup(1, [101, 100]);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/groups/1/videos/order', expect.objectContaining({ method: 'PATCH' }));
    });
  });

  describe('Tag Methods', () => {
    it('getTags calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ data: [], meta: { total: 0, limit: 24, offset: 0 } }))
      });
      await apiClient.getTags();
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/tags', expect.anything());
    });

    it('getTag calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ id: 1 }))
      });
      await apiClient.getTag(1);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/tags/1', expect.anything());
    });

    it('createTag calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ id: 1 }))
      });
      await apiClient.createTag({ name: 'Tag' });
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/tags', expect.objectContaining({ method: 'POST' }));
    });

    it('updateTag calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ id: 1 }))
      });
      await apiClient.updateTag(1, { name: 'New Tag' });
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/tags/1', expect.objectContaining({ method: 'PATCH' }));
    });

    it('deleteTag calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, headers: new Headers() });
      await apiClient.deleteTag(1);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/tags/1', expect.objectContaining({ method: 'DELETE' }));
    });

    it('addTagsToVideo calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ message: "OK" }))
      });
      await apiClient.addTagsToVideo(1, [10, 11]);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/1/tags', expect.objectContaining({ method: 'POST' }));
    });

    it('removeTagFromVideo calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, headers: new Headers() });
      await apiClient.removeTagFromVideo(1, 10);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/1/tags/10', expect.objectContaining({ method: 'DELETE' }));
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
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/chat/messages', expect.objectContaining({ method: 'POST' }));
    });

    it('chat with share slug calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ role: 'assistant', content: 'hello' }))
      });
      await apiClient.chat({ messages: [], share_slug: 'abc' });
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/chat/messages?share_slug=abc', expect.objectContaining({ method: 'POST' }));
    });

    it('setChatFeedback calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({}))
      });
      await apiClient.setChatFeedback(1, 'good');
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/chat/logs/1/feedback', expect.objectContaining({ method: 'PATCH' }));
    });

    it('getChatHistory calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ data: [], meta: { total: 0, limit: 24, offset: 0 } }))
      });
      await apiClient.getChatHistory(1);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/chat/groups/1/history', expect.anything());
    });

    it('getEvaluationSummary calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({
          group_id: 1,
          evaluated_count: 2,
          avg_faithfulness: 0.86,
          avg_answer_relevancy: 0.81,
          avg_context_precision: 0.78,
        }))
      });

      await apiClient.getEvaluationSummary(1);

      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/evaluation/groups/1/summary', expect.anything());
    });

    it('getChatEvaluations calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify([]))
      });

      await apiClient.getChatEvaluations(1);

      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/evaluation/groups/1/logs?limit=200', expect.anything());
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

      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/chat/groups/1/history?download=csv', expect.anything());
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
        text: () => Promise.resolve(JSON.stringify({ share_slug: 'abc' }))
      });
      await apiClient.createShareLink(1, 'my-group');
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/groups/1/share', expect.objectContaining({ method: 'POST', body: JSON.stringify({ share_slug: 'my-group' }) }));
    });

    it('deleteShareLink calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({}))
      });
      await apiClient.deleteShareLink(1);
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/videos/groups/1/share', expect.objectContaining({ method: 'DELETE' }));
    });

    it('getSharedGroup calls correct endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve(JSON.stringify({ id: 1 })),
        json: () => Promise.resolve({ id: 1 })
      });
      await apiClient.getSharedGroup('token');
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8000/api/videos/groups/share/token',
        expect.objectContaining({ headers: expect.any(Object) }),
      );
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
    it('should add share_slug parameter if URL origin matches API base URL', () => {
      // Mock baseUrl to match the video URL origin
      // Default baseUrl is http://localhost:8000/api
      const videoFile = 'http://localhost:8000/api/media/video.mp4';
      const shareToken = 'abc123';
      const result = apiClient.getSharedVideoUrl(videoFile, shareToken);
      expect(result).toBe('http://localhost:8000/api/media/video.mp4?share_slug=abc123');
    });

    it('should NOT add share_slug parameter if URL origin differs (e.g. S3)', () => {
      // API is http://localhost:8000, Video is S3
      const videoFile = 'https://my-bucket.s3.amazonaws.com/video.mp4?Sign=123';
      const shareToken = 'abc123';
      const result = apiClient.getSharedVideoUrl(videoFile, shareToken);
      // Result should be exactly the input URL, without additional query params
      expect(result).toBe(videoFile);
    });

    it('should return empty if url is empty', () => {
      expect(apiClient.getSharedVideoUrl('', 'token')).toBe('');
    });
  });
});
