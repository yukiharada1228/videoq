export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787/api';
// VITE_USE_S3_STORAGE=true: 署名 URL 直 PUT（ローカル MinIO / 本番 R2）。false: multipart → VIDEO_BUCKET。
const USE_S3_STORAGE = import.meta.env.VITE_USE_S3_STORAGE === 'true';

type RequestBody = BodyInit | object | null | undefined;
type ApiFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const defaultFetch: ApiFetch = (input, init) => (
  init === undefined ? fetch(input) : fetch(input, init)
);

export interface ApiClientOptions {
  baseUrl?: string;
  fetchFn?: ApiFetch;
  onUnauthorized?: () => void | Promise<void>;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    limit: number;
    offset: number;
  };
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
 * Structured API error carrying error code and optional params from the backend.
 * Backend format: { error: { code, message, params? } }
 */
export class ApiError extends Error {
  code: string;
  params?: Record<string, unknown>;
  details?: unknown;

  constructor(message: string, code: string, params?: Record<string, unknown>, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.params = params;
    this.details = details;
  }
}

export interface User {
  id: string;
  username: string;
  email: string;
  is_superuser?: boolean;
  video_count: number;
  max_video_upload_size_mb: number;
  used_storage_bytes?: number;
  storage_limit_bytes?: number | null;
  used_processing_seconds?: number;
  processing_limit_seconds?: number | null;
  used_ai_answers?: number;
  ai_answers_limit?: number | null;
  is_over_quota?: boolean;
  plan_code?: 'free' | 'basic' | 'pro';
  subscription_status?: string | null;
  quota_source?: 'plan' | 'admin';
}

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  is_active: boolean;
  is_staff: boolean;
  is_superuser: boolean;
  max_video_upload_size_mb: number;
  storage_limit_gb: number | null;
  processing_limit_minutes: number | null;
  ai_answers_limit: number | null;
  used_storage_bytes: number;
  used_processing_seconds: number;
  used_ai_answers: number;
  usage_period_start: string | null;
  is_over_quota: boolean;
  plan_code?: string;
  quota_source?: 'plan' | 'admin';
}

export interface AdminQuotaPatch {
  max_video_upload_size_mb?: number;
  storage_limit_gb?: number | null;
  processing_limit_minutes?: number | null;
  ai_answers_limit?: number | null;
  quota_source?: 'plan' | 'admin';
}

export interface AdminUsagePatch {
  used_storage_bytes?: number;
  used_processing_seconds?: number;
  used_ai_answers?: number;
  usage_period_start?: string | null;
  is_over_quota?: boolean;
}

export interface BillingPlan {
  code: 'free' | 'basic' | 'pro';
  interval: 'month' | 'year' | null;
  lookup_key: string | null;
  amount_yen: number;
  currency: 'jpy';
  entitlements: {
    max_video_upload_size_mb: number;
    storage_limit_gb: number;
    processing_limit_minutes: number;
    ai_answers_limit: number;
  };
}

export interface AdminFlagsPatch {
  is_active?: boolean;
  is_staff?: boolean;
  is_superuser?: boolean;
}

export interface IntegrationApiKey {
  id: string;
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

export interface SearchApiKeyStatus {
  has_api_key: boolean;
}

export interface AuthorizedOAuthToken {
  id: string;
  client_id: string;
  client_name: string;
  scope: string;
  issued_at: string;
  expires_at: string | null;
}

export interface SignupRequest {
  username: string;
  email: string;
  password: string;
  callbackURL?: string;
}

export interface VerifyEmailRequest {
  token: string;
}

export interface VerifyEmailResponse {
  detail?: string;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirmRequest {
  token: string;
  new_password: string;
}

export interface EmailChangeRequest {
  email: string;
}

export interface EmailChangeConfirmRequest {
  token: string;
}

export interface UsernameChangeRequest {
  username: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface Citation {
  id: number;
  video_id: number;
  title: string;
  start_time: string;
  end_time: string;
}

export interface ChatHistoryItem {
  id: number;
  course: number;
  asked_by: {
    user_id: string;
    username: string;
    email: string;
  } | null;
  question: string;
  answer: string;
  citations?: Citation[];
  is_shared_origin: boolean;
  feedback?: 'good' | 'bad' | null;
  created_at: string;
  evaluation?: ChatLogEvaluation;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  chat_log_id?: number;
  feedback?: 'good' | 'bad' | null;
}

export interface ChatAnalytics {
  summary: {
    total_questions: number;
    date_range: { first?: string; last?: string };
  };
  time_series: { date: string; count: number }[];
  feedback: { good: number; bad: number; none: number };
}

export type EvaluationStatus = 'pending' | 'completed' | 'failed';

export interface EvaluationSummary {
  course_id: number;
  evaluated_count: number;
  avg_faithfulness: number | null;
  avg_answer_relevancy: number | null;
  avg_context_precision: number | null;
}

export interface ChatLogEvaluation {
  chat_log_id: number;
  status: EvaluationStatus;
  faithfulness: number | null;
  answer_relevancy: number | null;
  context_precision: number | null;
  error_message: string;
  evaluated_at: string | null;
}

export interface ChatRequest {
  messages: ChatMessage[];
  course_id?: number;
  share_slug?: string;
  mode?: 'qa' | 'study';
  /** Ephemeral study progress key for shared-link sessions (sessionStorage). */
  study_session_id?: string;
}

export interface PlogWaypoint {
  start_sec?: number;
  end_sec?: number;
  label?: string;
  [key: string]: unknown;
}

export interface PlogConcept {
  id: number;
  label: string;
  node_type: string;
  intro_sec: number;
  source_quote: string;
  opening_question: string;
  hint_ladder: string[];
  misconceptions: string[];
  canonical_order: string[];
  worked_examples: string[];
  waypoints: PlogWaypoint[];
  hint_count: number;
  waypoint_count: number;
}

export interface PlogEdge {
  id: number;
  source_id: number;
  source_label: string;
  target_id: number;
  target_label: string;
  edge_type: string;
  quote: string;
}

export interface PlogGraph {
  video_id: number;
  build_status: string;
  input_tokens: number;
  output_tokens: number;
  error_message: string;
  summary_node_count: number;
  concepts: PlogConcept[];
  edges: PlogEdge[];
}

export interface PlogLearnerState {
  concept_id: number;
  label: string;
  reached: boolean;
  hint_index: number;
  last_grade: string;
  active: boolean;
}

export type ChatStreamEvent =
  | { type: 'content_chunk'; text: string }
  | { type: 'done'; chat_log_id: number | null; feedback: 'good' | 'bad' | null; citations?: Citation[] }
  | { type: 'error'; code: string; message: string };

export interface Video {
  id: number;
  user: string;
  file: string | null;
  source_type: 'uploaded' | 'youtube';
  source_url?: string | null;
  youtube_video_id?: string | null;
  youtube_embed_url?: string | null;
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
  source_type: 'uploaded' | 'youtube';
  source_url?: string | null;
  youtube_video_id?: string | null;
  youtube_embed_url?: string | null;
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

export interface YoutubeVideoCreateRequest {
  youtube_url: string;
  title: string;
  description?: string;
}

export interface VideoUpdateRequest {
  title?: string;
  description?: string;
  transcript?: string;
}

export interface VideoCourse {
  id: number;
  name: string;
  description: string;
  display_order: number;
  created_at: string;
  updated_at?: string;
  video_count: number;
  videos?: VideoInCourse[];
  share_slug?: string | null;
  access_role?: 'owner' | 'member' | 'public';
}

export interface VideoInCourse {
  id: number;
  title: string;
  description: string;
  file: string | null;
  source_type: 'uploaded' | 'youtube';
  source_url?: string | null;
  youtube_video_id?: string | null;
  youtube_embed_url?: string | null;
  uploaded_at: string;
  status: 'uploading' | 'pending' | 'processing' | 'indexing' | 'completed' | 'error';
  order: number;
}

export interface UploadRequestResponse {
  video: Video;
  upload_url: string;
}

export interface VideoCourseCreateRequest {
  name: string;
  description?: string;
}

export interface VideoCourseUpdateRequest {
  name?: string;
  description?: string;
}

export interface VideoCourseList {
  id: number;
  name: string;
  description: string;
  display_order: number;
  created_at: string;
  video_count: number;
  access_role?: 'owner' | 'member';
}

export type CourseInvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked';
export type CourseInvitationDeliveryStatus = 'queued' | 'sent' | 'failed';

export interface CourseInviteRecipientResult {
  email: string;
  // 送信はサーバー側のキューに載るため、レスポンス時点では配送結果は出ない。
  // 実際の sent/failed は participants の delivery_status で確認する。
  status: 'queued' | 'already_member' | 'already_invited' | 'invalid' | 'duplicate';
  invitation_id?: number;
}

export interface CourseInvitationListItem {
  id: number;
  email: string;
  status: CourseInvitationStatus;
  delivery_status: CourseInvitationDeliveryStatus;
  expires_at: string;
  created_at: string;
  last_sent_at: string | null;
  send_attempts: number;
}

export interface CourseUserMember {
  user_id: string;
  username: string;
  email: string;
  joined_at: string;
}

export interface CourseParticipants {
  invitations: CourseInvitationListItem[];
  members: CourseUserMember[];
}

export interface CourseInvitationPreview {
  course_id: number;
  course_name: string;
  inviter_name: string;
  email_hint: string;
  status: CourseInvitationStatus;
  expires_at: string;
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

export class ApiClient {
  private baseUrl: string;
  private fetchFn: ApiFetch;
  private onUnauthorized?: () => void | Promise<void>;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? API_URL).replace(/\/+$/, '');
    this.fetchFn = options.fetchFn ?? defaultFetch;
    this.onUnauthorized = options.onUnauthorized;
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
    try {
      const { authClient } = await import('@/lib/auth-client');
      await authClient.signOut();
    } catch {
      // Silently handle logout errors
    }
  }

  // Common method to build URL
  private buildUrl(endpoint: string): string {
    return `${this.baseUrl}${apiPath(endpoint)}`;
  }

  private unwrapEnvelope<T>(payload: unknown): T {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return payload as T;
    }
    const obj = payload as Record<string, unknown>;
    if ('data' in obj && !('meta' in obj) && Object.keys(obj).length === 1) {
      return obj.data as T;
    }
    return payload as T;
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

  private buildHeaders(body?: RequestBody, additionalHeaders?: HeadersInit): Record<string, string> {
    const baseHeaders =
      body instanceof FormData ? {} : this.getJsonHeaders();

    return {
      ...baseHeaders,
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

  private async handleAuthError(): Promise<void> {
    await this.logout();
    await this.onUnauthorized?.();
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

  /**
   * Common fetch execution logic
   * Basic fetch processing without retry logic
   * 401 errors don't throw exceptions, allowing special handling by caller
   */
  private async executeRequest(
    url: string,
    config: RequestInit
  ): Promise<Response> {
    const response = await this.fetchFn(url, config);

    // Process errors other than 401 immediately
    if (!response.ok && response.status !== 401) {
      await this.handleError(response);
    }

    return response;
  }

  private async request<T>(
    endpoint: string,
    options: Omit<RequestInit, 'body'> & { body?: RequestBody } = {},
  ): Promise<T> {
    const url = this.buildUrl(endpoint);
    const headers = this.buildHeaders(options.body, options.headers);
    const body = this.stringifyBody(options.body);

    const config: RequestInit = {
      credentials: 'include',
      ...options,
      body,
      headers,
    };

    try {
      const response = await this.executeRequest(url, config);
      if (response.status === 401) {
        await this.handleAuthError();
      }
      return this.unwrapEnvelope<T>(await this.parseJsonResponse<unknown>(response));
    } catch (error) {
      this.logError('API request failed:', error);
      throw error;
    }
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
  async confirmEmailChange(data: EmailChangeConfirmRequest): Promise<void> {
    const { authClient } = await import('@/lib/auth-client');
    const { error } = await authClient.verifyEmail({
      query: { token: data.token },
    });
    if (error) {
      throw new ApiError(error.message || 'Email change failed', error.code || 'EMAIL_CHANGE_FAILED');
    }
  }

  async getMe(): Promise<User> {
    return this.request<User>('/account/me');
  }

  async getSchema<T>(signal?: AbortSignal): Promise<T> {
    return this.request<T>('/schema', { signal });
  }

  async getMeOrNull(): Promise<User | null> {
    try {
      const url = this.buildUrl('/account/me');
      const response = await this.fetchFn(url, {
        headers: this.buildHeaders(),
        credentials: 'include',
      });
      if (!response.ok) return null;
      return this.unwrapEnvelope<User>(
        await this.parseJsonResponse<unknown>(response),
      );
    } catch {
      return null;
    }
  }

  async getIntegrationApiKeys(): Promise<IntegrationApiKey[]> {
    const { authClient } = await import('@/lib/auth-client');
    const { data, error } = await authClient.apiKey.list();
    if (error) throw new ApiError(error.message || 'Failed to list keys', error.code || 'API_KEY');
    const keys = (data?.apiKeys ?? data ?? []) as Array<Record<string, unknown>>;
    return keys.map((k) => {
      let accessLevel: 'all' | 'read_only' = 'all';
      const meta = k.metadata;
      if (typeof meta === 'string') {
        try {
          const parsed = JSON.parse(meta) as { accessLevel?: string };
          if (parsed.accessLevel === 'read_only') accessLevel = 'read_only';
        } catch { /* ignore */ }
      } else if (meta && typeof meta === 'object' && (meta as { accessLevel?: string }).accessLevel === 'read_only') {
        accessLevel = 'read_only';
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

  async getSearchApiKeyStatus(): Promise<SearchApiKeyStatus> {
    return this.request<SearchApiKeyStatus>('/account/searchapi-key');
  }

  async saveSearchApiKey(apiKey: string): Promise<void> {
    await this.request('/account/searchapi-key', {
      method: 'PUT',
      body: { api_key: apiKey },
    });
  }

  async deleteSearchApiKey(): Promise<void> {
    await this.request('/account/searchapi-key', {
      method: 'DELETE',
    });
  }

  async chat(data: ChatRequest): Promise<ChatMessage> {
    const { share_slug, ...bodyData } = data;
    const endpoint = share_slug ? `/chat/messages?share_slug=${share_slug}` : '/chat/messages';

    return this.request<ChatMessage>(endpoint, {
      method: 'POST',
      body: bodyData,
    });
  }

  async *chatStream(data: ChatRequest): AsyncGenerator<ChatStreamEvent> {
    const { share_slug, ...bodyData } = data;
    const endpoint = share_slug
      ? `/chat/messages/stream?share_slug=${share_slug}`
      : '/chat/messages/stream';

    const url = this.buildUrl(endpoint);
    const fetchStream = () => this.fetchFn(url, {
      method: 'POST',
      credentials: 'include',
      headers: this.buildHeaders(bodyData),
      body: JSON.stringify(bodyData),
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
      reader.releaseLock();
    }
  }

  async setChatFeedback(
    chatLogId: number,
    feedback: 'good' | 'bad' | null,
    shareSlug?: string,
  ): Promise<{ chat_log_id: number; feedback: 'good' | 'bad' | null }> {
    const endpoint = shareSlug
      ? `/chat/logs/${chatLogId}/feedback?share_slug=${shareSlug}`
      : `/chat/logs/${chatLogId}/feedback`;

    return this.request(endpoint, {
      method: 'PATCH',
      body: { feedback },
    });
  }

  async getChatHistory(courseId: number): Promise<ChatHistoryItem[]> {
    const response = await this.request<PaginatedResponse<ChatHistoryItem>>(`/chat/courses/${courseId}/history`);
    return response.data;
  }

  async getEvaluationSummary(courseId: number): Promise<EvaluationSummary> {
    return this.request<EvaluationSummary>(`/evaluation/courses/${courseId}/summary`);
  }

  async getChatEvaluations(courseId: number, limit = 200): Promise<ChatLogEvaluation[]> {
    const response = await this.request<PaginatedResponse<ChatLogEvaluation>>(`/evaluation/courses/${courseId}/logs?limit=${limit}`);
    return response.data;
  }


  async exportChatHistoryCsv(courseId: number): Promise<void> {
    const url = this.buildUrl(`/chat/courses/${courseId}/history?download=csv`);

    const doFetch = async (): Promise<Response> => {
      return this.fetchFn(url, {
        method: 'GET',
        headers: this.buildHeaders(),
      });
    };

    const response = await doFetch();
    if (response.status === 401) {
      await this.logout();
      throw new Error('Authentication failed');
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



  // Video-related methods
  async getVideos(params?: { q?: string; status?: string; ordering?: 'uploaded_at_desc' | 'uploaded_at_asc' | 'title_asc' | 'title_desc'; tags?: number[]; limit?: number; offset?: number }): Promise<PaginatedResponse<VideoList>> {
    const queryParams: Record<string, string> = {};
    if (params?.q && params.q.trim() !== '') queryParams.q = params.q.trim();
    if (params?.status && params.status.trim() !== '') queryParams.status = params.status.trim();
    if (params?.ordering) queryParams.ordering = params.ordering;
    if (params?.tags && params.tags.length > 0) {
      queryParams.tags = params.tags.join(',');
    }
    if (params?.limit !== undefined) queryParams.limit = String(params.limit);
    if (params?.offset !== undefined) queryParams.offset = String(params.offset);

    const query = Object.keys(queryParams).length
      ? `?${new URLSearchParams(queryParams).toString()}`
      : '';

    return this.request<PaginatedResponse<VideoList>>(`/videos${query}`);
  }

  async getVideo(id: number): Promise<Video> {
    return this.request<Video>(`/videos/${id}`);
  }

  async requestUploadUrl(data: {
    filename: string;
    content_type: string;
    file_size: number;
    title: string;
    description?: string;
  }): Promise<UploadRequestResponse> {
    return this.request<UploadRequestResponse>('/videos/uploads', {
      method: 'POST',
      body: data,
    });
  }

  async confirmUpload(videoId: number): Promise<Video> {
    return this.request<Video>(`/videos/${videoId}`, {
      method: 'PATCH',
      body: { status: 'uploaded' },
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

    return this.request<Video>('/videos', {
      method: 'POST',
      body: formData,
    });
  }

  async createYoutubeVideo(data: YoutubeVideoCreateRequest): Promise<Video> {
    return this.request<Video>('/videos/youtube', {
      method: 'POST',
      body: data,
    });
  }

  async updateVideo(id: number, data: VideoUpdateRequest): Promise<Video> {
    return this.request<Video>(`/videos/${id}`, {
      method: 'PATCH',
      body: data,
    });
  }

  async deleteVideo(id: number): Promise<void> {
    return this.request<void>(`/videos/${id}`, {
      method: 'DELETE',
    });
  }

  async getPlogGraph(videoId: number): Promise<PlogGraph> {
    return this.request<PlogGraph>(`/videos/${videoId}/plog`);
  }

  async rebuildPlog(
    videoId: number,
  ): Promise<{ video_id: number; status: string; job_id?: number }> {
    return this.request(`/videos/${videoId}/plog/rebuild`, {
      method: 'POST',
      body: {},
    });
  }

  async createPlogConcept(
    videoId: number,
    body: {
      label: string;
      node_type?: string;
      intro_sec?: number;
      source_quote?: string;
    },
  ): Promise<PlogConcept> {
    return this.request(`/videos/${videoId}/plog/concepts`, {
      method: 'POST',
      body,
    });
  }

  async updatePlogConcept(
    videoId: number,
    conceptId: number,
    body: Partial<{
      label: string;
      node_type: string;
      intro_sec: number;
      source_quote: string;
    }>,
  ): Promise<PlogConcept> {
    return this.request(`/videos/${videoId}/plog/concepts/${conceptId}`, {
      method: 'PATCH',
      body,
    });
  }

  async deletePlogConcept(videoId: number, conceptId: number): Promise<{ deleted: boolean; id: number }> {
    return this.request(`/videos/${videoId}/plog/concepts/${conceptId}`, {
      method: 'DELETE',
    });
  }

  async mergePlogConcepts(
    videoId: number,
    survivorId: number,
    absorbId: number,
  ): Promise<PlogConcept> {
    return this.request(`/videos/${videoId}/plog/concepts/${survivorId}/merge`, {
      method: 'POST',
      body: { absorb_id: absorbId },
    });
  }

  async updatePlogLearningObject(
    videoId: number,
    conceptId: number,
    body: Partial<{
      opening_question: string;
      hint_ladder: string[];
      misconceptions: string[];
      canonical_order: string[];
      worked_examples: string[];
      waypoints: PlogWaypoint[];
    }>,
  ): Promise<PlogConcept> {
    return this.request(`/videos/${videoId}/plog/concepts/${conceptId}/learning-object`, {
      method: 'PATCH',
      body,
    });
  }

  async createPlogEdge(
    videoId: number,
    body: {
      source_id: number;
      target_id: number;
      edge_type: string;
      quote?: string;
    },
  ): Promise<PlogEdge> {
    return this.request(`/videos/${videoId}/plog/edges`, {
      method: 'POST',
      body,
    });
  }

  async updatePlogEdge(
    videoId: number,
    edgeId: number,
    body: Partial<{
      source_id: number;
      target_id: number;
      edge_type: string;
      quote: string;
    }>,
  ): Promise<PlogEdge> {
    return this.request(`/videos/${videoId}/plog/edges/${edgeId}`, {
      method: 'PATCH',
      body,
    });
  }

  async deletePlogEdge(videoId: number, edgeId: number): Promise<{ deleted: boolean; id: number }> {
    return this.request(`/videos/${videoId}/plog/edges/${edgeId}`, {
      method: 'DELETE',
    });
  }

  async getPlogLearnerState(videoId: number): Promise<{ states: PlogLearnerState[] }> {
    return this.request(`/videos/${videoId}/plog/learner-state`);
  }

  async resetPlogLearnerState(videoId: number): Promise<{ deleted: number }> {
    return this.request(`/videos/${videoId}/plog/learner-state`, {
      method: 'DELETE',
    });
  }

  // VideoCourse-related methods
  async getVideoCoursesPage(params?: { limit?: number; offset?: number }): Promise<PaginatedResponse<VideoCourseList>> {
    const queryParams: Record<string, string> = {};
    if (params?.limit !== undefined) queryParams.limit = String(params.limit);
    if (params?.offset !== undefined) queryParams.offset = String(params.offset);
    const query = Object.keys(queryParams).length
      ? `?${new URLSearchParams(queryParams).toString()}`
      : '';

    return this.request<PaginatedResponse<VideoCourseList>>(`/videos/courses${query}`);
  }

  async getVideoCourses(): Promise<VideoCourseList[]> {
    const response = await this.getVideoCoursesPage();
    return response.data;
  }

  async getVideoCourse(id: number): Promise<VideoCourse> {
    return this.request<VideoCourse>(`/videos/courses/${id}`);
  }

  async createVideoCourse(data: VideoCourseCreateRequest): Promise<VideoCourse> {
    return this.request<VideoCourse>('/videos/courses', {
      method: 'POST',
      body: data,
    });
  }

  async updateVideoCourse(id: number, data: VideoCourseUpdateRequest): Promise<VideoCourse> {
    return this.request<VideoCourse>(`/videos/courses/${id}`, {
      method: 'PATCH',
      body: data,
    });
  }

  async deleteVideoCourse(id: number): Promise<void> {
    return this.request<void>(`/videos/courses/${id}`, {
      method: 'DELETE',
    });
  }

  async reorderVideoCourses(courseIds: number[]): Promise<{ message: string }> {
    return this.request<{ message: string }>('/videos/courses/order', {
      method: 'PATCH',
      body: { course_ids: courseIds },
    });
  }

  // Add/remove videos to/from course
  async addVideoToCourse(courseId: number, videoId: number): Promise<void> {
    return this.request<void>(`/videos/courses/${courseId}/videos/${videoId}`, {
      method: 'POST',
    });
  }

  async addVideosToCourse(courseId: number, videoIds: number[]): Promise<{ message: string; added_count: number; skipped_count: number }> {
    return this.request<{ message: string; added_count: number; skipped_count: number }>(`/videos/courses/${courseId}/videos`, {
      method: 'POST',
      body: { video_ids: videoIds },
    });
  }

  async removeVideoFromCourse(courseId: number, videoId: number): Promise<void> {
    return this.request<void>(`/videos/courses/${courseId}/videos/${videoId}`, {
      method: 'DELETE',
    });
  }

  async reorderVideosInCourse(courseId: number, videoIds: number[]): Promise<{ message: string }> {
    return this.request<{ message: string }>(`/videos/courses/${courseId}/videos/order`, {
      method: 'PATCH',
      body: { video_ids: videoIds },
    });
  }

  async inviteCourseMembers(
    courseId: number,
    emails: string[],
  ): Promise<{ results: CourseInviteRecipientResult[] }> {
    return this.request(`/videos/courses/${courseId}/invitations`, {
      method: 'POST',
      body: { emails },
    });
  }

  async getCourseParticipants(courseId: number): Promise<CourseParticipants> {
    return this.request(`/videos/courses/${courseId}/participants`);
  }

  async getCourseInvitation(token: string): Promise<CourseInvitationPreview> {
    return this.request(`/videos/course-invitations/${encodeURIComponent(token)}`);
  }

  async acceptCourseInvitation(
    token: string,
  ): Promise<{ course_id: number; status: 'accepted' }> {
    return this.request(`/videos/course-invitations/${encodeURIComponent(token)}/accept`, {
      method: 'POST',
    });
  }

  async declineCourseInvitation(token: string): Promise<{ status: 'declined' }> {
    return this.request(`/videos/course-invitations/${encodeURIComponent(token)}/decline`, {
      method: 'POST',
    });
  }

  async resendCourseInvitation(
    courseId: number,
    invitationId: number,
  ): Promise<{ delivery_status: CourseInvitationDeliveryStatus }> {
    return this.request(`/videos/courses/${courseId}/invitations/${invitationId}/resend`, {
      method: 'POST',
    });
  }

  async revokeCourseInvitation(courseId: number, invitationId: number): Promise<void> {
    await this.request(`/videos/courses/${courseId}/invitations/${invitationId}`, {
      method: 'DELETE',
    });
  }

  async removeCourseMember(courseId: number, userId: string): Promise<void> {
    await this.request(`/videos/courses/${courseId}/members/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });
  }

  async leaveVideoCourse(courseId: number): Promise<void> {
    await this.request(`/videos/courses/${courseId}/membership`, { method: 'DELETE' });
  }

  // Share link related
  async createShareLink(courseId: number, shareSlug: string): Promise<{ message: string; share_slug: string }> {
    return this.request<{ message: string; share_slug: string }>(
      `/videos/courses/${courseId}/share`,
      {
        method: 'POST',
        body: { share_slug: shareSlug },
      }
    );
  }

  async deleteShareLink(courseId: number): Promise<void> {
    await this.request<void>(`/videos/courses/${courseId}/share`, {
      method: 'DELETE',
    });
  }

  async getSharedCourse(shareSlug: string): Promise<VideoCourse> {
    const url = this.buildUrl(`/videos/courses/share/${shareSlug}`);
    const response = await this.fetchFn(url, { headers: this.buildHeaders() });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Failed to fetch shared course: ${response.statusText}`);
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

  // Tag management methods
  async getTags(): Promise<Tag[]> {
    const response = await this.request<PaginatedResponse<Tag>>('/videos/tags');
    return response.data;
  }

  async getTag(id: number): Promise<TagDetail> {
    return this.request<TagDetail>(`/videos/tags/${id}`);
  }

  async createTag(data: TagCreateRequest): Promise<Tag> {
    return this.request<Tag>('/videos/tags', {
      method: 'POST',
      body: data,
    });
  }

  async updateTag(id: number, data: TagUpdateRequest): Promise<Tag> {
    return this.request<Tag>(`/videos/tags/${id}`, {
      method: 'PATCH',
      body: data,
    });
  }

  async deleteTag(id: number): Promise<void> {
    return this.request<void>(`/videos/tags/${id}`, {
      method: 'DELETE',
    });
  }

  // Video-Tag relationship methods
  async addTagsToVideo(videoId: number, tagIds: number[]): Promise<{ message: string; added_count: number; skipped_count: number }> {
    return this.request<{ message: string; added_count: number; skipped_count: number }>(`/videos/${videoId}/tags`, {
      method: 'POST',
      body: { tag_ids: tagIds },
    });
  }

  async removeTagFromVideo(videoId: number, tagId: number): Promise<void> {
    return this.request<void>(`/videos/${videoId}/tags/${tagId}`, {
      method: 'DELETE',
    });
  }

  async getChatAnalytics(courseId: number): Promise<ChatAnalytics> {
    return this.request<ChatAnalytics>(`/chat/courses/${courseId}/analytics`);
  }

  async getAdminUsers(params?: {
    q?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedResponse<AdminUser>> {
    const query = new URLSearchParams();
    if (params?.q) query.set('q', params.q);
    if (params?.limit != null) query.set('limit', String(params.limit));
    if (params?.offset != null) query.set('offset', String(params.offset));
    const qs = query.toString();
    return this.request<PaginatedResponse<AdminUser>>(`/admin/users${qs ? `?${qs}` : ''}`);
  }

  async patchAdminUserQuota(id: string, data: AdminQuotaPatch): Promise<AdminUser> {
    return this.request<AdminUser>(`/admin/users/${id}/quota`, {
      method: 'PATCH',
      body: data,
    });
  }

  async patchAdminUserUsage(id: string, data: AdminUsagePatch): Promise<AdminUser> {
    return this.request<AdminUser>(`/admin/users/${id}/usage`, {
      method: 'PATCH',
      body: data,
    });
  }

  async patchAdminUserFlags(id: string, data: AdminFlagsPatch): Promise<AdminUser> {
    return this.request<AdminUser>(`/admin/users/${id}/flags`, {
      method: 'PATCH',
      body: data,
    });
  }

  async reindexAllEmbeddings(): Promise<{ job_id: string }> {
    return this.request<{ job_id: string }>('/admin/embeddings/reindex-all', {
      method: 'POST',
    });
  }

  async deleteAdminUser(id: string): Promise<{ job_id: string }> {
    return this.request<{ job_id: string }>(`/admin/users/${id}`, {
      method: 'DELETE',
    });
  }

  async getBillingPlans(): Promise<BillingPlan[]> {
    return this.request<BillingPlan[]>('/billing/plans');
  }

  async createBillingCheckout(data: {
    lookup_key: string;
    locale?: 'en' | 'ja';
  }): Promise<{ url: string }> {
    return this.request<{ url: string }>('/billing/checkout', {
      method: 'POST',
      body: data,
    });
  }

  async createBillingPortal(data?: { locale?: 'en' | 'ja' }): Promise<{ url: string }> {
    return this.request<{ url: string }>('/billing/portal', {
      method: 'POST',
      body: data ?? {},
    });
  }

}

export function createApiClient(options?: ApiClientOptions): ApiClient {
  return new ApiClient(options);
}

export const apiClient = createApiClient();
