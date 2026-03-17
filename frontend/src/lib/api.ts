export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

type RequestBody = BodyInit | object | null | undefined;

export type LoginResponse = Record<string, never>;

export type RefreshResponse = Record<string, never>;

export interface User {
  id: number;
  username: string;
  email: string;
  video_limit: number | null;
  video_count: number;
}

export interface IntegrationApiKey {
  id: number;
  name: string;
  access_level: 'all' | 'read_only';
  prefix: string;
  last_used_at: string | null;
  created_at: string;
}

export interface IntegrationApiKeyCreateRequest {
  name: string;
  access_level: 'all' | 'read_only';
}

export interface IntegrationApiKeyCreateResponse extends IntegrationApiKey {
  api_key: string;
}

export interface SignupRequest {
  username: string;
  email: string;
  password: string;
}

export interface VerifyEmailRequest {
  uid: string;
  token: string;
}

export interface VerifyEmailResponse {
  detail?: string;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirmRequest {
  uid: string;
  token: string;
  new_password: string;
}

export interface AccountDeleteRequest {
  reason?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RelatedVideo {
  video_id: number;
  title: string;
  start_time: string;
  end_time: string;
}

export interface PopularScene {
  video_id: number;
  title: string;
  start_time: string;
  end_time: string;
  reference_count: number;
  file: string | null;
  questions: string[];
}

export interface ChatHistoryItem {
  id: number;
  group: number;
  question: string;
  answer: string;
  related_videos: RelatedVideo[];
  is_shared_origin: boolean;
  feedback?: 'good' | 'bad' | null;
  created_at: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  related_videos?: RelatedVideo[];
  chat_log_id?: number;
  feedback?: 'good' | 'bad' | null;
}

export interface ChatAnalytics {
  summary: {
    total_questions: number;
    date_range: { first?: string; last?: string };
  };
  scene_distribution: {
    video_id: number;
    title: string;
    start_time: string;
    end_time: string;
    question_count: number;
  }[];
  time_series: { date: string; count: number }[];
  feedback: { good: number; bad: number; none: number };
  keywords: { word: string; count: number }[];
}

export interface ChatRequest {
  messages: ChatMessage[];
  group_id?: number;
  share_token?: string;
}

export interface Video {
  id: number;
  user: number;
  file: string | null;
  title: string;
  description: string;
  uploaded_at: string;
  transcript?: string;
  status: 'uploading' | 'pending' | 'processing' | 'indexing' | 'completed' | 'error';
  error_message?: string;
  tags?: { id: number; name: string; color: string }[];
}

export interface VideoList {
  id: number;
  file: string | null;
  title: string;
  description: string;
  uploaded_at: string;
  status: 'uploading' | 'pending' | 'processing' | 'indexing' | 'completed' | 'error';
  tags?: { id: number; name: string; color: string }[];
}

export interface VideoUploadRequest {
  file: File;
  title: string;
  description?: string;
}

export interface VideoUpdateRequest {
  title?: string;
  description?: string;
}

export interface VideoGroup {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at?: string;
  video_count: number;
  videos?: VideoInGroup[];
  share_token?: string | null;
}

export interface VideoInGroup {
  id: number;
  title: string;
  description: string;
  file: string | null;
  uploaded_at: string;
  status: 'uploading' | 'pending' | 'processing' | 'indexing' | 'completed' | 'error';
  order: number;
}

export interface UploadRequestResponse {
  video: Video;
  upload_url: string;
}

export interface VideoGroupCreateRequest {
  name: string;
  description?: string;
}

export interface VideoGroupUpdateRequest {
  name?: string;
  description?: string;
}

export interface VideoGroupList {
  id: number;
  name: string;
  description: string;
  created_at: string;
  video_count: number;
}



export interface Tag {
  id: number;
  name: string;
  color: string;
  created_at: string;
  video_count?: number;
}

export interface TagDetail extends Tag {
  videos?: VideoList[];
}

export interface TagCreateRequest {
  name: string;
  color?: string;
}

export interface TagUpdateRequest {
  name?: string;
  color?: string;
}

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_URL;
  }

  // HttpOnly Cookie-based authentication (security enhancement)
  // Use HttpOnly Cookie instead of localStorage to prevent XSS attacks

  async isAuthenticated(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/me/`, {
        method: 'GET',
        credentials: 'include', // Send HttpOnly Cookie
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async logout(): Promise<void> {
    try {
      const csrfToken = await this.ensureCsrfToken();
      await fetch(`${this.baseUrl}/auth/sessions/`, {
        method: 'DELETE',
        credentials: 'include', // Send HttpOnly Cookie
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRFToken': csrfToken } : {}),
        },
      });
    } catch {
      // Silently handle logout errors
    }
  }

  // Common method to build URL
  private buildUrl(endpoint: string): string {
    return `${this.baseUrl}${endpoint}`;
  }

  // Common method to automatically JSON.stringify body if it's an object
  private stringifyBody(body: RequestBody): BodyInit | null | undefined {
    if (
      body &&
      typeof body === 'object' &&
      !(body instanceof FormData) &&
      !(body instanceof URLSearchParams) &&
      !(body instanceof ReadableStream) &&
      !(body instanceof ArrayBuffer)
    ) {
      return JSON.stringify(body);
    }
    return body;
  }

  // Common method to generate basic JSON headers
  private getJsonHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json' };
  }

  private isSafeMethod(method?: string): boolean {
    const normalizedMethod = (method ?? 'GET').toUpperCase();
    return ['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(normalizedMethod);
  }

  private csrfToken: string | null = null;

  private getCsrfTokenFromCookie(): string | null {
    const match = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  private async ensureCsrfToken(): Promise<string | null> {
    // Try in-memory cache first, then cookie (same-origin only)
    if (this.csrfToken) {
      return this.csrfToken;
    }
    const cookieToken = this.getCsrfTokenFromCookie();
    if (cookieToken) {
      this.csrfToken = cookieToken;
      return cookieToken;
    }

    // Fetch from server; cross-origin deployments return token in body
    const response = await fetch(this.buildUrl('/auth/csrf/'), {
      method: 'GET',
      credentials: 'include',
      headers: {},
    });

    if (response.ok) {
      try {
        const data = await response.json();
        if (data.csrftoken) {
          this.csrfToken = data.csrftoken;
          return this.csrfToken;
        }
      } catch {
        // 204 or non-JSON response; fall back to cookie
      }
    }

    this.csrfToken = this.getCsrfTokenFromCookie();
    return this.csrfToken;
  }

  private buildHeaders(additionalHeaders?: HeadersInit): Record<string, string> {
    const headers: Record<string, string> = {
      ...this.getJsonHeaders(),
      ...(additionalHeaders as Record<string, string>),
    };

    // Authorization header not needed since we use HttpOnly Cookie
    // Don't store tokens in JavaScript-accessible locations to prevent XSS attacks

    return headers;
  }

  private async handleError(response: Response): Promise<never> {
    const errorData = (await response.json().catch(() => ({
      detail: response.statusText,
    }))) as unknown;

    if (errorData && typeof errorData === 'object') {
      // Handle unified error format: { error: { code, message, fields } }
      const maybeError = (errorData as { error?: unknown }).error;
      if (maybeError && typeof maybeError === 'object') {
        const errorObj = maybeError as { code?: string; message?: string; fields?: Record<string, string[]> };
        if (typeof errorObj.message === 'string') {
          throw new Error(errorObj.message);
        }
      }
    }

    throw new Error(`HTTP error! status: ${response.status}`);
  }

  private async handleAuthError(): Promise<void> {
    // With HttpOnly Cookie-based authentication, delegate logout to backend
    await this.logout();
    window.location.href = '/login';
    throw new Error("Authentication failed");
  }

  // Common method to output error logs
  private logError(message: string, error: unknown): void {
    console.error(message, error);
  }

  // Common method to safely get JSON from response
  private async parseJsonResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type');
    const isJson = contentType && contentType.includes('application/json');

    // Check Content-Length or Transfer-Encoding header
    const contentLength = response.headers.get('content-length');
    if (contentLength === '0' || (!isJson && !contentLength)) {
      return {} as T;
    }

    const text = await response.text();
    if (!text || text.trim() === '') {
      return {} as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      return {} as T;
    }
  }

  // Common method to handle 401 errors
  private async handle401Error<T>(response: Response, retryCount: number, retryCallback: () => Promise<T>): Promise<T | null> {
    if (response.status === 401 && retryCount === 0) {
      try {
        await this.refreshToken();
        const result = await retryCallback();
        return result;
      } catch {
        await this.handleAuthError();
      }
      return null;
    }

    if (response.status === 401) {
      await this.handleAuthError();
      return null;
    }

    return null;
  }

  /**
   * Common fetch execution logic
   * Basic fetch processing without retry logic
   * 401 errors don't throw exceptions, allowing special handling by caller
   */
  private async executeRequest(
    url: string,
    config: RequestInit
  ): Promise<Response> {
    const response = await fetch(url, config);

    // Process errors other than 401 immediately
    if (!response.ok && response.status !== 401) {
      await this.handleError(response);
    }

    return response;
  }

  private async request<T>(
    endpoint: string,
    options: Omit<RequestInit, 'body'> & { body?: RequestBody } = {},
    retryCount: number = 0
  ): Promise<T> {
    // Use common method to build URL
    const url = this.buildUrl(endpoint);
    const headers = this.buildHeaders(options.headers);

    if (!this.isSafeMethod(options.method)) {
      const csrfToken = await this.ensureCsrfToken();
      if (csrfToken) {
        headers['X-CSRFToken'] = csrfToken;
      }
    }

    // Use common method to stringify body
    const body = this.stringifyBody(options.body);

    const config: RequestInit = {
      ...options,
      body,
      headers,
      credentials: 'include', // Send HttpOnly Cookie
    };

    try {
      // Use common fetch execution logic
      const response = await this.executeRequest(url, config);

      // Use common method to handle 401 errors
      const retryResult = await this.handle401Error<T>(response, retryCount, () => this.request(endpoint, options, retryCount + 1));

      // Return recursively called result if retried
      if (retryResult !== null && retryResult !== undefined) {
        return retryResult as T;
      }

      // Use common method to get JSON from response
      return await this.parseJsonResponse<T>(response);
    } catch (error) {
      // Use common method to output error logs
      this.logError('API request failed:', error);
      throw error;
    }
  }

  async signup(data: SignupRequest): Promise<void> {
    await this.request('/auth/users/', {
      method: 'POST',
      body: data,
    });
  }

  async verifyEmail(data: VerifyEmailRequest): Promise<VerifyEmailResponse> {
    return this.request<VerifyEmailResponse>('/auth/email-verifications/', {
      method: 'POST',
      body: data,
    });
  }

  async login(data: LoginRequest): Promise<LoginResponse> {
    const response = await this.request<LoginResponse>('/auth/sessions/', {
      method: 'POST',
      body: data,
    });

    // With HttpOnly Cookie-based authentication, backend sets Cookie
    // No need to store tokens on frontend

    return response;
  }

  async requestPasswordReset(data: PasswordResetRequest): Promise<void> {
    await this.request('/auth/password-resets/', {
      method: 'POST',
      body: data,
    });
  }

  async confirmPasswordReset(data: PasswordResetConfirmRequest): Promise<void> {
    const { token, uid, new_password } = data;
    await this.request(`/auth/password-resets/${token}/`, {
      method: 'PATCH',
      body: { uid, new_password },
    });
  }

  async refreshToken(): Promise<RefreshResponse> {
    // With HttpOnly Cookie-based authentication, backend automatically updates Cookie
    // No need to manage refresh tokens on frontend
    // Call backend refresh endpoint as needed

    // Use executeRequest() directly to bypass retry logic.
    // If the refresh endpoint itself returns 401, throw immediately to prevent
    // an infinite loop where handle401Error would call refreshToken() again.
    const url = this.buildUrl('/auth/tokens/');
    const headers = this.buildHeaders();
    const csrfToken = await this.ensureCsrfToken();
    if (csrfToken) {
      headers['X-CSRFToken'] = csrfToken;
    }

    const response = await this.executeRequest(url, {
      method: 'PUT',
      headers,
      credentials: 'include',
    });

    if (response.status === 401) {
      throw new Error('Token refresh failed: unauthorized');
    }

    return await this.parseJsonResponse<RefreshResponse>(response);
  }

  async getMe(): Promise<User> {
    return this.request<User>('/auth/me');
  }

  async getIntegrationApiKeys(): Promise<IntegrationApiKey[]> {
    return this.request<IntegrationApiKey[]>('/auth/api-keys/');
  }

  async createIntegrationApiKey(
    data: IntegrationApiKeyCreateRequest,
  ): Promise<IntegrationApiKeyCreateResponse> {
    return this.request<IntegrationApiKeyCreateResponse>('/auth/api-keys/', {
      method: 'POST',
      body: data,
    });
  }

  async revokeIntegrationApiKey(id: number): Promise<void> {
    await this.request(`/auth/api-keys/${id}/`, {
      method: 'DELETE',
    });
  }

  async deleteAccount(data?: AccountDeleteRequest): Promise<void> {
    await this.request('/auth/account/', {
      method: 'DELETE',
      body: data ?? {},
    });
  }

  async chat(data: ChatRequest): Promise<ChatMessage> {
    const { share_token, ...bodyData } = data;
    const endpoint = share_token ? `/chat/messages/?share_token=${share_token}` : '/chat/messages/';

    return this.request<ChatMessage>(endpoint, {
      method: 'POST',
      body: bodyData,
    });
  }

  async setChatFeedback(
    chatLogId: number,
    feedback: 'good' | 'bad' | null,
    shareToken?: string,
  ): Promise<{ chat_log_id: number; feedback: 'good' | 'bad' | null }> {
    const endpoint = shareToken ? `/chat/feedback/?share_token=${shareToken}` : '/chat/feedback/';

    return this.request(endpoint, {
      method: 'POST',
      body: {
        chat_log_id: chatLogId,
        feedback,
      },
    });
  }

  async getChatHistory(groupId: number): Promise<ChatHistoryItem[]> {
    return this.request<ChatHistoryItem[]>(`/chat/history/?group_id=${groupId}`);
  }


  async exportChatHistoryCsv(groupId: number): Promise<void> {
    const url = this.buildUrl(`/chat/history/?group_id=${groupId}&download=csv`);

    const doFetch = async (): Promise<Response> => {
      return fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {},
      });
    };

    let response = await doFetch();
    if (response.status === 401) {
      try {
        await this.refreshToken();
        response = await doFetch();
      } catch {
        await this.logout();
        throw new Error("Authentication failed");
      }
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Failed to export CSV: ${response.statusText}`);
    }

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || response.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const filename = match?.[1] || `chat_history_group_${groupId}.csv`;

    const link = document.createElement('a');
    const href = window.URL.createObjectURL(blob);
    link.href = href;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(href);
  }



  // Video-related methods
  async getVideos(params?: { q?: string; status?: string; ordering?: 'uploaded_at_desc' | 'uploaded_at_asc' | 'title_asc' | 'title_desc'; tags?: number[] }): Promise<VideoList[]> {
    const queryParams: Record<string, string> = {};
    if (params?.q && params.q.trim() !== '') queryParams.q = params.q.trim();
    if (params?.status && params.status.trim() !== '') queryParams.status = params.status.trim();
    if (params?.ordering) queryParams.ordering = params.ordering;
    if (params?.tags && params.tags.length > 0) {
      queryParams.tags = params.tags.join(',');
    }

    const query = Object.keys(queryParams).length
      ? `?${new URLSearchParams(queryParams).toString()}`
      : '';

    return this.request<VideoList[]>(`/videos/${query}`);
  }

  async getVideo(id: number): Promise<Video> {
    return this.request<Video>(`/videos/${id}/`);
  }

  async requestUploadUrl(data: {
    filename: string;
    content_type: string;
    file_size: number;
    title: string;
    description?: string;
  }): Promise<UploadRequestResponse> {
    return this.request<UploadRequestResponse>('/videos/upload-request/', {
      method: 'POST',
      body: data,
    });
  }

  async confirmUpload(videoId: number): Promise<Video> {
    return this.request<Video>(`/videos/${videoId}/upload-complete/`, {
      method: 'POST',
    });
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
    // 1. Request presigned upload URL
    const { video, upload_url } = await this.requestUploadUrl({
      filename: data.file.name,
      content_type: data.file.type || 'video/mp4',
      file_size: data.file.size,
      title: data.title,
      description: data.description,
    });

    // 2. Upload file directly to R2/S3
    await this.uploadToPresignedUrl(upload_url, data.file, data.file.type || 'video/mp4', onProgress);

    // 3. Confirm upload
    const confirmed = await this.confirmUpload(video.id);
    return confirmed;
  }

  async updateVideo(id: number, data: VideoUpdateRequest): Promise<Video> {
    return this.request<Video>(`/videos/${id}/`, {
      method: 'PATCH',
      body: data,
    });
  }

  async deleteVideo(id: number): Promise<void> {
    return this.request<void>(`/videos/${id}/`, {
      method: 'DELETE',
    });
  }

  // VideoGroup-related methods
  async getVideoGroups(): Promise<VideoGroupList[]> {
    return this.request<VideoGroupList[]>('/videos/groups/');
  }

  async getVideoGroup(id: number): Promise<VideoGroup> {
    return this.request<VideoGroup>(`/videos/groups/${id}/`);
  }

  async createVideoGroup(data: VideoGroupCreateRequest): Promise<VideoGroup> {
    return this.request<VideoGroup>('/videos/groups/', {
      method: 'POST',
      body: data,
    });
  }

  async updateVideoGroup(id: number, data: VideoGroupUpdateRequest): Promise<VideoGroup> {
    return this.request<VideoGroup>(`/videos/groups/${id}/`, {
      method: 'PATCH',
      body: data,
    });
  }

  async deleteVideoGroup(id: number): Promise<void> {
    return this.request<void>(`/videos/groups/${id}/`, {
      method: 'DELETE',
    });
  }

  // Add/remove videos to/from group
  async addVideoToGroup(groupId: number, videoId: number): Promise<void> {
    return this.request<void>(`/videos/groups/${groupId}/videos/${videoId}/`, {
      method: 'POST',
    });
  }

  async addVideosToGroup(groupId: number, videoIds: number[]): Promise<{ message: string; added_count: number; skipped_count: number }> {
    return this.request<{ message: string; added_count: number; skipped_count: number }>(`/videos/groups/${groupId}/videos/`, {
      method: 'POST',
      body: { video_ids: videoIds },
    });
  }

  async removeVideoFromGroup(groupId: number, videoId: number): Promise<void> {
    return this.request<void>(`/videos/groups/${groupId}/videos/${videoId}/`, {
      method: 'DELETE',
    });
  }

  async reorderVideosInGroup(groupId: number, videoIds: number[]): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/videos/groups/${groupId}/videos/order/`, {
      method: 'PATCH',
      body: { video_ids: videoIds },
    });
  }

  // Share link related
  async createShareLink(groupId: number): Promise<{ message: string; share_token: string }> {
    return this.request<{ message: string; share_token: string }>(
      `/videos/groups/${groupId}/share/`,
      {
        method: 'POST',
      }
    );
  }

  async deleteShareLink(groupId: number): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/videos/groups/${groupId}/share/`, {
      method: 'DELETE',
    });
  }

  async getSharedGroup(shareToken: string): Promise<VideoGroup> {
    // Shared groups don't require authentication, so don't include credentials
    const url = this.buildUrl(`/videos/groups/share/${shareToken}/`);
    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Failed to fetch shared group: ${response.statusText}`);
    }

    return response.json();
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

  // Get video URL for shared group (add share_token as query parameter)
  getSharedVideoUrl(videoFile: string, shareToken: string): string {
    // First convert to absolute URL using backend origin
    const absoluteUrl = this.getVideoUrl(videoFile);

    // If getVideoUrl returned empty string, return empty string
    if (!absoluteUrl) {
      return '';
    }

    // Then add share_token parameter ONLY if the URL is served from our API (ProtectedMediaView)
    // S3 presigned URLs (external origin) already contain authentication info in query params,
    // and appending share_token would invalidate the S3 signature.

    // Check if the video URL shares the same origin with our API
    // We compare with this.baseUrl (which might be relative or absolute)
    try {
      const videoUrlObj = new URL(absoluteUrl);
      const apiBaseUrlObj = new URL(this.baseUrl, window.location.origin);

      // If origins match, it means we are serving the file, so we need the share token for permission check
      if (videoUrlObj.origin === apiBaseUrlObj.origin) {
        videoUrlObj.searchParams.set('share_token', shareToken);
        return videoUrlObj.toString();
      }

      // If origins differ (e.g. S3), do NOT append share_token
      return absoluteUrl;
    } catch (e) {
      // If URL parsing fails, fallback to original behavior (safer) or return as is
      console.warn('Failed to parse video URL for share token check', e);
      return absoluteUrl;
    }
  }

  // Tag management methods
  async getTags(): Promise<Tag[]> {
    return this.request<Tag[]>('/videos/tags/');
  }

  async getTag(id: number): Promise<TagDetail> {
    return this.request<TagDetail>(`/videos/tags/${id}/`);
  }

  async createTag(data: TagCreateRequest): Promise<Tag> {
    return this.request<Tag>('/videos/tags/', {
      method: 'POST',
      body: data,
    });
  }

  async updateTag(id: number, data: TagUpdateRequest): Promise<Tag> {
    return this.request<Tag>(`/videos/tags/${id}/`, {
      method: 'PATCH',
      body: data,
    });
  }

  async deleteTag(id: number): Promise<void> {
    return this.request<void>(`/videos/tags/${id}/`, {
      method: 'DELETE',
    });
  }

  // Video-Tag relationship methods
  async addTagsToVideo(videoId: number, tagIds: number[]): Promise<{ message: string; added_count: number; skipped_count: number }> {
    return this.request<{ message: string; added_count: number; skipped_count: number }>(`/videos/${videoId}/tags/`, {
      method: 'POST',
      body: { tag_ids: tagIds },
    });
  }

  async removeTagFromVideo(videoId: number, tagId: number): Promise<void> {
    return this.request<void>(`/videos/${videoId}/tags/${tagId}/`, {
      method: 'DELETE',
    });
  }

  async searchScenes(queryText: string, groupId: number, shareToken?: string): Promise<{ query_text: string; related_videos?: RelatedVideo[] }> {
    const params = new URLSearchParams({ query_text: queryText, group_id: String(groupId) });
    if (shareToken) params.set('share_token', shareToken);
    return this.request(`/chat/scenes/?${params.toString()}`);
  }

  async getPopularScenes(groupId: number, shareToken?: string, limit?: number): Promise<PopularScene[]> {
    const params = new URLSearchParams({ group_id: String(groupId) });
    if (shareToken) {
      params.set('share_token', shareToken);
    }
    if (limit) {
      params.set('limit', String(limit));
    }
    return this.request<PopularScene[]>(`/chat/popular-scenes/?${params.toString()}`);
  }

  async getChatAnalytics(groupId: number): Promise<ChatAnalytics> {
    return this.request<ChatAnalytics>(`/chat/analytics/?group_id=${groupId}`);
  }

}

export const apiClient = new ApiClient();
