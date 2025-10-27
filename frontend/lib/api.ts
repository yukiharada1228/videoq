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

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_URL;
  }

  // ローカルストレージへのアクセスを共通化
  private getToken(): string | null {
    return localStorage.getItem('access_token');
  }

  private setTokens(access: string, refresh: string): void {
    localStorage.setItem('access_token', access);
    localStorage.setItem('refresh_token', refresh);
  }

  private removeTokens(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }

  private buildHeaders(additionalHeaders?: HeadersInit): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(additionalHeaders as Record<string, string>),
    };

    const accessToken = this.getToken();
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    return headers;
  }

  private async handleError(response: Response): Promise<never> {
    const error = await response.json().catch(() => ({ 
      detail: response.statusText 
    }));
    throw new Error(error.detail || `HTTP error! status: ${response.status}`);
  }

  private async handleAuthError(): Promise<void> {
    this.removeTokens();
    window.location.href = '/login';
    throw new Error('認証に失敗しました。再度ログインしてください。');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retryCount: number = 0
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = this.buildHeaders(options.headers);

    const config: RequestInit = {
      ...options,
      headers,
    };

    try {
      const response = await fetch(url, config);
      
      // 401エラー（認証エラー）の場合、リフレッシュトークンで再試行
      if (response.status === 401 && retryCount === 0) {
        try {
          await this.refreshToken();
          return this.request(endpoint, options, retryCount + 1);
        } catch (refreshError) {
          await this.handleAuthError();
        }
      }
      
      if (!response.ok) {
        await this.handleError(response);
      }

      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  async signup(data: SignupRequest): Promise<void> {
    await this.request('/auth/signup/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async login(data: LoginRequest): Promise<LoginResponse> {
    const response = await this.request<LoginResponse>('/auth/login/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    
    this.setTokens(response.access, response.refresh);
    
    return response;
  }

  async refreshToken(): Promise<RefreshResponse> {
    const refreshToken = localStorage.getItem('refresh_token');
    
    if (!refreshToken) {
      throw new Error('No refresh token found');
    }

    const url = `${this.baseUrl}/auth/refresh/`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: refreshToken }),
    });

    if (!response.ok) {
      throw new Error('Refresh token failed');
    }

    const data = await response.json();
    localStorage.setItem('access_token', data.access);

    return data;
  }

  async getMe(): Promise<User> {
    return this.request<User>('/auth/me');
  }

  async updateMe(data: UpdateUserRequest): Promise<User> {
    return this.request<User>('/auth/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async logout(): Promise<void> {
    this.removeTokens();
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }
}

export const apiClient = new ApiClient();

