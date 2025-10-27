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

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
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

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_URL;
  }

  // ローカルストレージへのアクセスを共通化
  // トークンを取得する共通メソッド（DRY原則）
  private getTokenFromStorage(key: string): string | null {
    return localStorage.getItem(key);
  }

  private getToken(): string | null {
    return this.getTokenFromStorage('access_token');
  }

  private getRefreshToken(): string | null {
    return this.getTokenFromStorage('refresh_token');
  }

  private setToken(key: string, value: string): void {
    localStorage.setItem(key, value);
  }

  private setTokens(access: string, refresh: string): void {
    this.setToken('access_token', access);
    this.setToken('refresh_token', refresh);
  }

  private setAccessToken(access: string): void {
    this.setToken('access_token', access);
  }

  // トークンを削除する共通メソッド（DRY原則）
  private removeToken(key: string): void {
    localStorage.removeItem(key);
  }

  private removeTokens(): void {
    this.removeToken('access_token');
    this.removeToken('refresh_token');
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

    const accessToken = this.getToken();
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    return headers;
  }

  private async handleError(response: Response): Promise<never> {
    const error: any = await response.json().catch(() => ({ 
      detail: response.statusText 
    }));
    throw new Error(error?.detail || error?.message || `HTTP error! status: ${response.status}`);
  }

  private async handleAuthError(): Promise<void> {
    this.removeTokens();
    window.location.href = '/login';
    throw new Error('認証に失敗しました。再度ログインしてください。');
  }

  // エラーログを出力する共通メソッド（DRY原則）
  private logError(message: string, error: any): void {
    console.error(message, error);
  }

  // レスポンスのJSONを安全に取得する共通メソッド（DRY原則）
  private async parseJsonResponse<T>(response: Response): Promise<T> {
    return await response.json();
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
    
    this.setTokens(response.access, response.refresh);
    
    return response;
  }

  async refreshToken(): Promise<RefreshResponse> {
    const refreshToken = this.getRefreshToken();
    
    if (!refreshToken) {
      throw new Error('No refresh token found');
    }

    // 認証エラー時のリトライを防ぐため、APIエンドポイントを直接呼び出す
    // 共通メソッドを使用してURLを構築
    const url = this.buildUrl('/auth/refresh/');
    const body = { refresh: refreshToken };
    
    // 共通メソッドを使用してbodyを文字列化（DRY原則）
    const bodyStringified = this.stringifyBody(body);
    
    try {
      // 共通メソッドを使用してJSONヘッダーを取得（DRY原則）
      const response = await this.executeRequest<RefreshResponse>(url, {
        method: 'POST',
        headers: this.getJsonHeaders(),
        body: bodyStringified,
      });
      
      // 共通メソッドを使用してレスポンスのJSONを取得
      const data = await this.parseJsonResponse<RefreshResponse>(response);
      
      // 新しいアクセストークンを保存
      if (data.access) {
        this.setAccessToken(data.access);
      }

      return data;
    } catch (error) {
      // リフレッシュトークンも無効な場合は認証エラーとして処理
      // 共通メソッドを使用してエラーログを出力
      this.logError('Refresh token failed:', error);
      await this.handleAuthError();
      throw error;
    }
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
    return this.request<ChatMessage>('/chat/', {
      method: 'POST',
      body: data,
    });
  }

  async logout(): Promise<void> {
    this.removeTokens();
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
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
    const token = this.getToken();
    
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

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
}

export const apiClient = new ApiClient();

