const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

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
  encrypted_openai_api_key?: string | null;
}

export interface UpdateUserRequest {
  encrypted_openai_api_key?: string | null;
}

export interface SignupRequest {
  username: string;
  password: string;
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

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  related_videos?: RelatedVideo[];
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
  owner_has_api_key?: boolean;
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

  // HttpOnly Cookieベースの認証（セキュリティ強化）
  // localStorageの代わりにHttpOnly Cookieを使用してXSS攻撃を防止
  
  async isAuthenticated(): Promise<boolean> {
    try {
      console.log('🔍 Checking authentication...');
      const response = await fetch(`${this.baseUrl}/auth/me/`, {
        method: 'GET',
        credentials: 'include', // HttpOnly Cookieを送信
        headers: {
          'Content-Type': 'application/json',
        },
      });
      console.log('🔍 Auth check response:', response.status, response.ok);
      return response.ok;
    } catch (error) {
      console.error('🔍 Auth check error:', error);
      return false;
    }
  }

  async logout(): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/auth/logout/`, {
        method: 'POST',
        credentials: 'include', // HttpOnly Cookieを送信
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  // URLを構築する共通メソッド（DRY原則）
  private buildUrl(endpoint: string): string {
    return `${this.baseUrl}${endpoint}`;
  }

  // bodyがオブジェクトの場合、自動的にJSON.stringifyする共通メソッド（DRY原則）
  private stringifyBody(body: any): BodyInit | null | undefined {
    if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof URLSearchParams) && !(body instanceof ReadableStream) && !(body instanceof ArrayBuffer)) {
      return JSON.stringify(body);
    }
    return body;
  }

  // 基本的なJSONヘッダーを生成する共通メソッド（DRY原則）
  private getJsonHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json' };
  }

  private buildHeaders(additionalHeaders?: HeadersInit): Record<string, string> {
    const headers: Record<string, string> = {
      ...this.getJsonHeaders(),
      ...(additionalHeaders as Record<string, string>),
    };

    // HttpOnly Cookieを使用するため、Authorizationヘッダーは不要
    // XSS攻撃を防ぐため、トークンをJavaScriptからアクセス可能な場所に保存しない

    return headers;
  }

  private async handleError(response: Response): Promise<never> {
    const error: any = await response.json().catch(() => ({ 
      detail: response.statusText 
    }));
    throw new Error(error?.detail || error?.message || `HTTP error! status: ${response.status}`);
  }

  private async handleAuthError(): Promise<void> {
    // HttpOnly Cookieベースの認証では、ログアウト処理をバックエンドに委譲
    await this.logout();
    window.location.href = '/login';
    throw new Error('認証に失敗しました。再度ログインしてください。');
  }

  // エラーログを出力する共通メソッド（DRY原則）
  private logError(message: string, error: any): void {
    console.error(message, error);
  }

  // レスポンスのJSONを安全に取得する共通メソッド（DRY原則）
  private async parseJsonResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type');
    const isJson = contentType && contentType.includes('application/json');
    
    // Content-LengthまたはTransfer-Encodingヘッダーをチェック
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
    } catch (e) {
      console.warn('Failed to parse JSON:', text);
      return {} as T;
    }
  }

  // 401エラーを処理する共通メソッド（DRY原則）
  private async handle401Error<T>(response: Response, retryCount: number, retryCallback: () => Promise<T>): Promise<T | null> {
    if (response.status === 401 && retryCount === 0) {
      try {
        await this.refreshToken();
        const result = await retryCallback();
        return result;
      } catch (refreshError) {
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
   * 共通のfetch実行ロジック（DRY原則に従う）
   * リトライロジックなしの基本的なfetch処理
   * 401エラーは例外を投げず、呼び出し元で特別な処理が可能
   */
  private async executeRequest<T>(
    url: string,
    config: RequestInit
  ): Promise<Response> {
    const response = await fetch(url, config);
    
    // 401以外のエラーは即座に処理
    if (!response.ok && response.status !== 401) {
      await this.handleError(response);
    }

    return response;
  }

  private async request<T>(
    endpoint: string,
    options: Omit<RequestInit, 'body'> & { body?: any } = {},
    retryCount: number = 0
  ): Promise<T> {
    // 共通メソッドを使用してURLを構築
    const url = this.buildUrl(endpoint);
    const headers = this.buildHeaders(options.headers);

    // 共通メソッドを使用してbodyを文字列化
    const body = this.stringifyBody(options.body);

    const config: RequestInit = {
      ...options,
      body,
      headers,
      credentials: 'include', // HttpOnly Cookieを送信
    };

    try {
      // 共通のfetch実行ロジックを使用
      const response = await this.executeRequest<T>(url, config);
      
      // 共通メソッドを使用して401エラーを処理
      const retryResult = await this.handle401Error<T>(response, retryCount, () => this.request(endpoint, options, retryCount + 1));
      
      // リトライした場合は再帰的に呼ばれた結果を返す
      if (retryResult !== null && retryResult !== undefined) {
        return retryResult as T;
      }

      // 共通メソッドを使用してレスポンスのJSONを取得
      return await this.parseJsonResponse<T>(response);
    } catch (error) {
      // 共通メソッドを使用してエラーログを出力
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

  async login(data: LoginRequest): Promise<LoginResponse> {
    const response = await this.request<LoginResponse>('/auth/login/', {
      method: 'POST',
      body: data,
    });
    
    // HttpOnly Cookieベースの認証では、バックエンドがCookieを設定するため
    // フロントエンドでトークンを保存する必要はない
    
    return response;
  }

  async refreshToken(): Promise<RefreshResponse> {
    // HttpOnly Cookieベースの認証では、バックエンドがCookieを自動更新するため
    // フロントエンドでリフレッシュトークンを管理する必要はない
    // 必要に応じてバックエンドのリフレッシュエンドポイントを呼び出す
    
    const response = await this.request<RefreshResponse>('/auth/refresh/', {
      method: 'POST',
      body: {}, // バックエンドがCookieからリフレッシュトークンを取得
    });
    
    return response;
  }

  async getMe(): Promise<User> {
    return this.request<User>('/auth/me');
  }

  async updateMe(data: UpdateUserRequest): Promise<User> {
    return this.request<User>('/auth/me', {
      method: 'PUT',
      body: data,
    });
  }

  async chat(data: ChatRequest): Promise<ChatMessage> {
    const { share_token, ...bodyData } = data;
    const endpoint = share_token ? `/chat/?share_token=${share_token}` : '/chat/';

    return this.request<ChatMessage>(endpoint, {
      method: 'POST',
      body: bodyData,
    });
  }



  // Video関連のメソッド
  async getVideos(): Promise<VideoList[]> {
    return this.request<VideoList[]>('/videos/');
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
    
    // HttpOnly Cookieベースの認証では、Authorizationヘッダーは不要
    const headers: Record<string, string> = {};

    try {
      const response = await this.executeRequest<Video>(url, {
        method: 'POST',
        headers,
        body: formData,
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

  // VideoGroup関連のメソッド
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

  // グループに動画を追加・削除
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

  // 共有リンク関連
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
    // 共有グループは認証不要なので、credentials を含めない
    const url = this.buildUrl(`/videos/groups/shared/${shareToken}/`);
    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Failed to fetch shared group: ${response.statusText}`);
    }

    return response.json();
  }

  // 共有グループの動画URL取得（share_tokenをクエリパラメータに追加）
  getSharedVideoUrl(videoFile: string, shareToken: string): string {
    const url = new URL(videoFile, window.location.origin);
    url.searchParams.set('share_token', shareToken);
    return url.toString();
  }

}

export const apiClient = new ApiClient();

