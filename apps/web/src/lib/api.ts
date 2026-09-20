import { API_URL } from './apiConfig';
import { ApiError } from './api-error';
import { createAppTrpcClient, TRPC_UNAUTHORIZED_EVENT } from './trpc';
import { videoSchema } from '@videoq/trpc/schema';
import type {
  AuthorizedOAuthToken,
  ChatRequest,
  ChatStreamEvent,
  EmailChangeConfirmRequest,
  EmailChangeRequest,
  IntegrationApiKey,
  IntegrationApiKeyCreateRequest,
  IntegrationApiKeyCreateResponse,
  LoginRequest,
  PasswordResetConfirmRequest,
  PasswordResetRequest,
  SignupRequest,
  UploadRequestResponse,
  UsernameChangeRequest,
  VerifyEmailRequest,
  VerifyEmailResponse,
  Video,
  VideoUploadRequest,
} from './api-types';

export { API_URL } from './apiConfig';
export { ApiError } from './api-error';
export type * from './api-types';
// VITE_USE_S3_STORAGE=true: 署名 URL 直 PUT（ローカル MinIO / 本番 R2）。false: multipart → VIDEO_BUCKET。
const USE_S3_STORAGE = import.meta.env.VITE_USE_S3_STORAGE === 'true';

type ApiFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const defaultFetch: ApiFetch = (input, init) => (
  init === undefined ? fetch(input) : fetch(input, init)
);

export interface ApiClientOptions {
  baseUrl?: string;
  fetchFn?: ApiFetch;
  onUnauthorized?: () => void | Promise<void>;
}

/**
 * Origin the API is served from. `VITE_API_URL` is a same-origin path (`/api`)
 * in Docker and production, but an absolute URL in local development.
 */
export function getApiOrigin(): string {
  return new URL(API_URL, window.location.origin).origin;
}

/** Strip trailing slashes from API paths (except root). Preserves query strings. */
export function apiPath(path: string): string {
  if (!path || path === '/') return path;
  const qIdx = path.indexOf('?');
  if (qIdx === -1) {
    return path.replace(/\/+$/, '') || '/';
  }
  const pathname = path.slice(0, qIdx).replace(/\/+$/, '') || '/';
  return pathname + path.slice(qIdx);
}

/**
 * UI-facing adapter over the inferred tRPC client. Better Auth and
 * protocol-specific transports such as multipart uploads, CSV, and SSE stay explicit.
 */
export class ApiClient {
  private baseUrl: string;
  private fetchFn: ApiFetch;
  private onUnauthorized?: () => void | Promise<void>;
  private rpc: ReturnType<typeof createAppTrpcClient>;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? API_URL).replace(/\/+$/, '');
    this.fetchFn = options.fetchFn ?? defaultFetch;
    this.onUnauthorized = options.onUnauthorized;
    this.rpc = createAppTrpcClient({
      baseUrl: this.baseUrl,
      fetchFn: this.fetchFn,
      onUnauthorized: () => this.notifyUnauthorized(),
    });
  }

  setUnauthorizedHandler(onUnauthorized: ApiClientOptions['onUnauthorized']): void {
    this.onUnauthorized = onUnauthorized;
  }

  async isAuthenticated(): Promise<boolean> {
    const { fetchAuthSession } = await import('@/lib/authSession');
    const { data } = await fetchAuthSession();
    return Boolean(data?.user);
  }

  async logout(): Promise<void> {
    const { authClient } = await import('@/lib/auth-client');
    const { error } = await authClient.signOut();
    if (error) throw new ApiError(error.message || 'Logout failed', error.code || 'LOGOUT_FAILED');
  }

  private async notifyUnauthorized(): Promise<void> {
    try {
      if (this.onUnauthorized) await this.onUnauthorized();
      else if (typeof window !== 'undefined') window.dispatchEvent(new Event(TRPC_UNAUTHORIZED_EVENT));
    } catch {
      // A failed session refresh must not hide the original request error.
    }
  }

  // Common method to build URL
  private buildUrl(endpoint: string): string {
    return `${this.baseUrl}${apiPath(endpoint)}`;
  }

  private jsonHeaders(additionalHeaders?: HeadersInit): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(additionalHeaders as Record<string, string>),
    };
  }

  private async handleError(response: Response): Promise<never> {
    const errorData = (await response.json().catch(() => ({
      detail: response.statusText,
    }))) as unknown;

    if (errorData && typeof errorData === 'object') {
      // Unified error format: { error: { code, message, details?, params?, fields? } }
      const maybeError = (errorData as { error?: unknown }).error;
      if (maybeError && typeof maybeError === 'object') {
        const errorObj = maybeError as {
          code?: string;
          message?: string;
          params?: Record<string, unknown>;
          details?: unknown;
          fields?: Record<string, string[]>;
        };
        if (typeof errorObj.message === 'string') {
          throw new ApiError(
            errorObj.message,
            errorObj.code ?? 'UNKNOWN',
            errorObj.params,
            errorObj.details ?? errorObj.fields,
          );
        }
      }
    }

    throw new ApiError(`HTTP error! status: ${response.status}`, 'UNKNOWN');
  }

  private async handleAuthError(): Promise<never> {
    await this.notifyUnauthorized();
    throw new Error("Authentication failed");
  }

  async signup(data: SignupRequest): Promise<void> {
    const { authClient } = await import('@/lib/auth-client');
    const { error } = await authClient.signUp.email({
      email: data.email,
      password: data.password,
      name: data.username,
      username: data.username,
      ...(data.callbackURL ? { callbackURL: data.callbackURL } : {}),
    });
    if (error) throw new ApiError(error.message || 'Signup failed', error.code || 'SIGNUP_FAILED');
  }

  async verifyEmail(data: VerifyEmailRequest): Promise<VerifyEmailResponse> {
    const { authClient } = await import('@/lib/auth-client');
    const { error } = await authClient.verifyEmail({ query: { token: data.token } });
    if (error) throw new ApiError(error.message || 'Verification failed', error.code || 'VERIFY_FAILED');
    return { detail: 'Email verified' };
  }

  async login(data: LoginRequest): Promise<void> {
    const { authClient } = await import('@/lib/auth-client');
    const { error } = await authClient.signIn.username({
      username: data.username,
      password: data.password,
    });
    if (error) throw new ApiError(error.message || 'Login failed', error.code || 'LOGIN_FAILED');
  }

  /** Redirects to Google OAuth via Better Auth (`signIn.social`). */
  async loginWithGoogle(callbackURL = '/'): Promise<void> {
    const { authClient } = await import('@/lib/auth-client');
    const { error } = await authClient.signIn.social({
      provider: 'google',
      callbackURL,
    });
    if (error) {
      throw new ApiError(error.message || 'Google sign-in failed', error.code || 'GOOGLE_SIGN_IN_FAILED');
    }
  }

  async requestPasswordReset(data: PasswordResetRequest): Promise<void> {
    const { authClient } = await import('@/lib/auth-client');
    const { error } = await authClient.requestPasswordReset({
      email: data.email,
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw new ApiError(error.message || 'Request failed', error.code || 'RESET_FAILED');
  }

  async confirmPasswordReset(data: PasswordResetConfirmRequest): Promise<void> {
    const { authClient } = await import('@/lib/auth-client');
    const { error } = await authClient.resetPassword({
      token: data.token,
      newPassword: data.new_password,
    });
    if (error) throw new ApiError(error.message || 'Reset failed', error.code || 'RESET_FAILED');
  }

  async requestEmailChange(data: EmailChangeRequest): Promise<void> {
    const { authClient } = await import('@/lib/auth-client');
    const { error } = await authClient.changeEmail({
      newEmail: data.email,
      callbackURL: `${window.location.origin}/change-email`,
    });
    if (error) throw new ApiError(error.message || 'Email change failed', error.code || 'EMAIL_CHANGE_FAILED');
  }

  /**
   * Updates username via Better Auth `/update-user`.
   * Also sets `displayUsername` so Google-signup accounts stay in sync.
   */
  async updateUsername(data: UsernameChangeRequest): Promise<void> {
    const { authClient } = await import('@/lib/auth-client');
    const username = data.username.trim();
    const { error } = await authClient.updateUser({
      username,
      displayUsername: username,
    });
    if (error) {
      throw new ApiError(error.message || 'Username change failed', error.code || 'USERNAME_CHANGE_FAILED');
    }
  }

  /**
   * Completes email change when the verification link lands on the SPA with `?token=`.
   * Prefer BA's `/api/auth/verify-email` link; this covers callback/token handoff cases.
   */
  async confirmEmailChange(data: EmailChangeConfirmRequest): Promise<{ requiresNewEmailVerification: boolean }> {
    const { authClient } = await import('@/lib/auth-client');
    const { data: result, error } = await authClient.verifyEmail({
      query: { token: data.token },
    });
    if (error) {
      throw new ApiError(error.message || 'Email change failed', error.code || 'EMAIL_CHANGE_FAILED');
    }
    // Current-address approval sends the next email and returns only status.
    // New-address verification returns the updated user.
    return { requiresNewEmailVerification: !result || !('user' in result) || !result.user };
  }

  async getIntegrationApiKeys(): Promise<IntegrationApiKey[]> {
    const { authClient } = await import('@/lib/auth-client');
    const { data, error } = await authClient.apiKey.list();
    if (error) throw new ApiError(error.message || 'Failed to list keys', error.code || 'API_KEY');
    const keys = (data?.apiKeys ?? data ?? []) as Array<Record<string, unknown>>;
    return keys.map((k) => {
      // Use the same field precedence as API enforcement, including legacy keys.
      let accessLevel: 'all' | 'read_only' = 'read_only';
      let meta = k.metadata;
      if (typeof meta === 'string') {
        try {
          meta = JSON.parse(meta);
        } catch { meta = null; }
      }
      if (meta && typeof meta === 'object') {
        const parsed = meta as { accessLevel?: unknown; access_level?: unknown };
        if ((parsed.accessLevel ?? parsed.access_level) === 'all') accessLevel = 'all';
      }
      return {
        id: String(k.id),
        name: String(k.name ?? ''),
        access_level: accessLevel,
        prefix: String(k.start ?? k.prefix ?? 'vq_'),
        last_used_at: (k.lastRequest as string | null) ?? null,
        created_at: String(k.createdAt ?? ''),
      };
    });
  }

  async createIntegrationApiKey(
    data: IntegrationApiKeyCreateRequest,
  ): Promise<IntegrationApiKeyCreateResponse> {
    const { authClient } = await import('@/lib/auth-client');
    const { data: created, error } = await authClient.apiKey.create({
      name: data.name,
      prefix: 'vq_',
      metadata: { accessLevel: data.access_level },
    });
    if (error || !created) {
      throw new ApiError(error?.message || 'Failed to create key', error?.code || 'API_KEY');
    }
    return {
      id: String(created.id),
      name: String(created.name ?? data.name),
      access_level: data.access_level,
      prefix: String(created.start ?? created.prefix ?? 'vq_'),
      last_used_at: null,
      created_at: String(created.createdAt ?? new Date().toISOString()),
      api_key: String(created.key ?? ''),
    };
  }

  async revokeIntegrationApiKey(id: string | number): Promise<void> {
    const { authClient } = await import('@/lib/auth-client');
    const { error } = await authClient.apiKey.delete({ keyId: String(id) });
    if (error) throw new ApiError(error.message || 'Failed to revoke key', error.code || 'API_KEY');
  }

  async getAuthorizedOAuthTokens(): Promise<AuthorizedOAuthToken[]> {
    const { authClient } = await import('@/lib/auth-client');
    const { data, error } = await authClient.oauth2.getConsents();
    if (error) {
      throw new ApiError(error.message || 'Failed to list connected apps', error.code || 'OAUTH');
    }
    const consents = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
    return Promise.all(
      consents.map(async (consent) => {
        const clientId = String(consent.clientId ?? '');
        let clientName = clientId;
        if (clientId) {
          try {
            const pub = await authClient.oauth2.publicClient({
              query: { client_id: clientId },
            });
            const name = (pub.data as { client_name?: string } | null)?.client_name;
            if (name) clientName = name;
          } catch {
            /* keep clientId */
          }
        }
        const scopes = Array.isArray(consent.scopes)
          ? (consent.scopes as string[]).join(' ')
          : String(consent.scopes ?? '');
        const createdAt = consent.createdAt;
        return {
          id: String(consent.id ?? ''),
          client_id: clientId,
          client_name: clientName,
          scope: scopes,
          issued_at:
            createdAt instanceof Date
              ? createdAt.toISOString()
              : String(createdAt ?? new Date().toISOString()),
          expires_at: null,
        };
      }),
    );
  }

  async revokeAuthorizedOAuthToken(id: number | string): Promise<void> {
    const { authClient } = await import('@/lib/auth-client');
    const { error } = await authClient.oauth2.deleteConsent({ id: String(id) });
    if (error) {
      throw new ApiError(error.message || 'Failed to revoke connected app', error.code || 'OAUTH');
    }
  }

  async *chatStream(data: ChatRequest, signal?: AbortSignal): AsyncGenerator<ChatStreamEvent> {
    const { share_slug, ...bodyData } = data;
    const endpoint = share_slug
      ? `/chat/messages/stream?share_slug=${encodeURIComponent(share_slug)}`
      : '/chat/messages/stream';

    const url = this.buildUrl(endpoint);
    const fetchStream = () => this.fetchFn(url, {
      method: 'POST',
      credentials: 'include',
      headers: this.jsonHeaders(),
      body: JSON.stringify(bodyData),
      signal,
    });

    const response = await fetchStream();
    if (response.status === 401) {
      await this.handleAuthError();
    }

    if (!response.ok) {
      await this.handleError(response);
      return;
    }

    if (!response.body) return;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6).trim();
            if (jsonStr) {
              try {
                yield JSON.parse(jsonStr) as ChatStreamEvent;
              } catch {
                // ignore malformed JSON
              }
            }
          }
        }
      }
    } finally {
      // Returning early on a terminal SSE event must release the connection too.
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }

  async exportChatHistoryCsv(courseId: number): Promise<void> {
    const url = this.buildUrl(`/chat/courses/${courseId}/history.csv`);

    const doFetch = async (): Promise<Response> => {
      return this.fetchFn(url, {
        method: 'GET',
        credentials: 'include',
        headers: this.jsonHeaders(),
      });
    };

    const response = await doFetch();
    if (response.status === 401) {
      await this.handleAuthError();
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Failed to export CSV: ${response.statusText}`);
    }

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || response.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const filename = match?.[1] || `chat_history_course_${courseId}.csv`;

    const link = document.createElement('a');
    const href = window.URL.createObjectURL(blob);
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(href);
  }
  private async requestUploadUrl(data: {
    filename: string;
    content_type: string;
    file_size: number;
    title: string;
    description?: string;
  }): Promise<UploadRequestResponse> {
    return this.rpc.videos.requestUpload.mutate({
      filename: data.filename,
      contentType: data.content_type,
      fileSize: data.file_size,
      title: data.title,
      description: data.description,
    });
  }

  private async confirmUpload(videoId: number): Promise<Video> {
    return this.rpc.videos.confirmUpload.mutate({ id: videoId });
  }

  async uploadToPresignedUrl(
    url: string,
    file: File,
    contentType: string,
    onProgress?: (percent: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', contentType);

      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        });
      }

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Upload failed')));
      xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

      xhr.send(file);
    });
  }

  async uploadVideo(
    data: VideoUploadRequest,
    onProgress?: (percent: number) => void,
  ): Promise<Video> {
    if (USE_S3_STORAGE) {
      // 1. Request presigned upload URL
      const { video, upload_url } = await this.requestUploadUrl({
        filename: data.file.name,
        content_type: data.file.type || 'video/mp4',
        file_size: data.file.size,
        title: data.title,
        description: data.description,
      });

      // 2. Upload file directly to R2/S3
      await this.uploadToPresignedUrl(
        upload_url,
        data.file,
        data.file.type || 'video/mp4',
        onProgress,
      );

      // 3. Confirm upload
      return await this.confirmUpload(video.id);
    }

    const formData = new FormData();
    formData.append('file', data.file);
    formData.append('title', data.title);
    formData.append('description', data.description ?? '');

    const response = await this.fetchFn(this.buildUrl('/videos'), {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    if (response.status === 401) await this.handleAuthError();
    if (!response.ok) await this.handleError(response);
    return videoSchema.parse(await response.json());
  }

  // Get video URL (convert relative URLs to absolute URLs using backend origin)
  getVideoUrl(videoFile: string | null): string {
    if (!videoFile) return '';

    // If already absolute URL (http:// or https://), return as-is
    if (videoFile.startsWith('http://') || videoFile.startsWith('https://')) {
      return videoFile;
    }

    // Resolve baseUrl against window.location.origin to get proper backend URL
    // This handles both absolute URLs (http://...) and relative paths (/api)
    const resolvedBase = new URL(this.baseUrl, window.location.origin);

    // For relative URLs
    if (videoFile.startsWith('/')) {
      // videoFile is an absolute path from origin, combine with origin only
      return `${resolvedBase.origin}${videoFile}`;
    }

    // videoFile is a relative path, combine with base URL path to preserve base path segments
    // Remove trailing slash from base pathname if exists to avoid duplicate slashes
    const basePath = resolvedBase.pathname.replace(/\/$/, '');
    return `${resolvedBase.origin}${basePath}/${videoFile}`;
  }

  // Get video URL for shared course (add share_slug as query parameter)
  getSharedVideoUrl(videoFile: string, shareSlug: string): string {
    // First convert to absolute URL using backend origin
    const absoluteUrl = this.getVideoUrl(videoFile);

    // If getVideoUrl returned empty string, return empty string
    if (!absoluteUrl) {
      return '';
    }

    // Then add share_slug parameter ONLY if the URL is served from our API (ProtectedMediaView)
    // S3 presigned URLs (external origin) already contain authentication info in query params,
    // and appending share_slug would invalidate the S3 signature.

    // Check if the video URL shares the same origin with our API
    // We compare with this.baseUrl (which might be relative or absolute)
    try {
      const videoUrlObj = new URL(absoluteUrl);
      const apiBaseUrlObj = new URL(this.baseUrl, window.location.origin);

      // If origins match, it means we are serving the file, so we need the share slug for permission check
      if (videoUrlObj.origin === apiBaseUrlObj.origin) {
        videoUrlObj.searchParams.set('share_slug', shareSlug);
        return videoUrlObj.toString();
      }

      // If origins differ (e.g. S3), do NOT append share_slug
      return absoluteUrl;
    } catch (e) {
      // If URL parsing fails, fallback to original behavior (safer) or return as is
      console.warn('Failed to parse video URL for share slug check', e);
      return absoluteUrl;
    }
  }

}

export function createApiClient(options?: ApiClientOptions): ApiClient {
  return new ApiClient(options);
}

export const apiClient = createApiClient();
