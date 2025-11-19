import { initI18n } from '@/i18n/config';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

const i18n = initI18n();

type RequestBody = BodyInit | object | null | undefined;

export interface LoginResponse {
  access: string;
  refresh: string;
}

export interface RefreshResponse {
  access: string;
}

export interface User {
  id: number;
  username: string;
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

export interface ChatRequest {
  messages: ChatMessage[];
  group_id?: number;
  share_token?: string;
}

export interface Video {
  id: number;
  user: number;
  file: string;
  title: string;
  description: string;
  uploaded_at: string;
  transcript?: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error_message?: string;
}

export interface VideoList {
  id: number;
  file: string;
  title: string;
  description: string;
  uploaded_at: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
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
  file: string;
  uploaded_at: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  order: number;
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
      await fetch(`${this.baseUrl}/auth/logout/`, {
        method: 'POST',
        credentials: 'include', // Send HttpOnly Cookie
        headers: {
          'Content-Type': 'application/json',
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
      const maybeDetail = (errorData as { detail?: unknown }).detail;
      const maybeMessage = (errorData as { message?: unknown }).message;
      if (typeof maybeDetail === 'string') {
        throw new Error(maybeDetail);
      }
      if (typeof maybeMessage === 'string') {
        throw new Error(maybeMessage);
      }
    }

    throw new Error(`HTTP error! status: ${response.status}`);
  }

  private async handleAuthError(): Promise<void> {
    // With HttpOnly Cookie-based authentication, delegate logout to backend
    await this.logout();
    window.location.href = '/login';
    throw new Error(i18n.t("errors.authFailed"));
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
   * Common fetch execution logic (following DRY principle)
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
    await this.request('/auth/signup/', {
      method: 'POST',
      body: data,
    });
  }

  async verifyEmail(data: VerifyEmailRequest): Promise<VerifyEmailResponse> {
    return this.request<VerifyEmailResponse>('/auth/verify-email/', {
      method: 'POST',
      body: data,
    });
  }

  async login(data: LoginRequest): Promise<LoginResponse> {
    const response = await this.request<LoginResponse>('/auth/login/', {
      method: 'POST',
      body: data,
    });
    
    // With HttpOnly Cookie-based authentication, backend sets Cookie
    // No need to store tokens on frontend
    
    return response;
  }

  async requestPasswordReset(data: PasswordResetRequest): Promise<void> {
    await this.request('/auth/password-reset/', {
      method: 'POST',
      body: data,
    });
  }

  async confirmPasswordReset(data: PasswordResetConfirmRequest): Promise<void> {
    await this.request('/auth/password-reset/confirm/', {
      method: 'POST',
      body: data,
    });
  }

  async refreshToken(): Promise<RefreshResponse> {
    // With HttpOnly Cookie-based authentication, backend automatically updates Cookie
    // No need to manage refresh tokens on frontend
    // Call backend refresh endpoint as needed
    
    const response = await this.request<RefreshResponse>('/auth/refresh/', {
      method: 'POST',
      body: {}, // Backend gets refresh token from Cookie
    });
    
    return response;
  }

  async getMe(): Promise<User> {
    return this.request<User>('/auth/me');
  }

  async chat(data: ChatRequest): Promise<ChatMessage> {
    const { share_token, ...bodyData } = data;
    const endpoint = share_token ? `/chat/?share_token=${share_token}` : '/chat/';

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
    const url = this.buildUrl(`/chat/history/export/?group_id=${groupId}`);

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
        throw new Error(i18n.t("errors.authFailed"));
      }
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Failed to export CSV: ${response.statusText}`);
    }

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || response.headers.get('content-disposition') || '';
    const match = disposition.match(/filename=\"?([^\";]+)\"?/i);
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
  async getVideos(params?: { q?: string; status?: string; ordering?: 'uploaded_at_desc' | 'uploaded_at_asc' | 'title_asc' | 'title_desc' }): Promise<VideoList[]> {
    const queryParams: Record<string, string> = {};
    if (params?.q && params.q.trim() !== '') queryParams.q = params.q.trim();
    if (params?.status && params.status.trim() !== '') queryParams.status = params.status.trim();
    if (params?.ordering) queryParams.ordering = params.ordering;

    const query = Object.keys(queryParams).length
      ? `?${new URLSearchParams(queryParams).toString()}`
      : '';

    return this.request<VideoList[]>(`/videos/${query}`);
  }

  async getVideo(id: number): Promise<Video> {
    return this.request<Video>(`/videos/${id}/`);
  }

  async uploadVideo(data: VideoUploadRequest): Promise<Video> {
    const formData = new FormData();
    formData.append('file', data.file);
    formData.append('title', data.title);
    if (data.description) {
      formData.append('description', data.description);
    }

    const url = this.buildUrl('/videos/');
    
    // Authorization header not needed with HttpOnly Cookie-based authentication
    const headers: Record<string, string> = {};

    try {
      const response = await this.executeRequest(url, {
        method: 'POST',
        headers,
        body: formData,
        credentials: 'include',
      });

      return await this.parseJsonResponse<Video>(response);
    } catch (error) {
      this.logError('Video upload failed:', error);
      throw error;
    }
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
    return this.request<void>(`/videos/groups/${groupId}/videos/${videoId}/remove/`, {
      method: 'DELETE',
    });
  }

  async reorderVideosInGroup(groupId: number, videoIds: number[]): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/videos/groups/${groupId}/reorder/`, {
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
    return this.request<{ message: string }>(`/videos/groups/${groupId}/share/delete/`, {
      method: 'DELETE',
    });
  }

  async getSharedGroup(shareToken: string): Promise<VideoGroup> {
    // Shared groups don't require authentication, so don't include credentials
    const url = this.buildUrl(`/videos/groups/shared/${shareToken}/`);
    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Failed to fetch shared group: ${response.statusText}`);
    }

    return response.json();
  }

  // Get video URL for shared group (add share_token as query parameter)
  getSharedVideoUrl(videoFile: string, shareToken: string): string {
    const url = new URL(videoFile, window.location.origin);
    url.searchParams.set('share_token', shareToken);
    return url.toString();
  }

}

export const apiClient = new ApiClient();

