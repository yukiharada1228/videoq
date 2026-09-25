import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@videoq/trpc';

type RouterInputs = inferRouterInputs<AppRouter>;
type RouterOutputs = inferRouterOutputs<AppRouter>;
export type User = RouterOutputs['account']['me'];
export type AdminUser = RouterOutputs['admin']['getUser'];

export type ChatMessage = RouterOutputs['chat']['send'];
export type Citation = NonNullable<ChatMessage['citations']>[number];
export type ChatHistoryItem = RouterOutputs['chat']['history']['data'][number];
export type ChatAnalytics = RouterOutputs['chat']['analytics'];
export type EvaluationSummary = RouterOutputs['evaluation']['summary'];
export type ChatLogEvaluation = RouterOutputs['evaluation']['logs']['data'][number];

export type Video = RouterOutputs['videos']['get'];
export type VideoList = RouterOutputs['videos']['list']['data'][number];
export type UploadRequestResponse = RouterOutputs['videos']['requestUpload'];

export type VideoCourse = RouterOutputs['courses']['get'];
export type VideoInCourse = NonNullable<VideoCourse['videos']>[number];

export type Tag = RouterOutputs['tags']['list']['data'][number];

// Better Auth and raw-transport request/response types are intentionally not
// part of the tRPC router.
export interface IntegrationApiKey {
  id: string;
  config_id?: string;
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

export interface ChatRequest {
  messages: RouterInputs['chat']['send']['messages'];
  course_id?: number;
  share_slug?: string;
}

export type ChatStreamEvent =
  | { type: 'content_chunk'; text: string }
  /** RAG がシーン検索を開始した。回答トークンはまだ流れない。 */
  | { type: 'searching'; query: string; search_id?: number }
  | { type: 'search_completed'; query: string; search_id: number; result_count: number }
  | {
      type: 'done';
      chat_log_id: number | null;
      feedback: 'good' | 'bad' | null;
      citations?: Citation[];
    }
  | { type: 'error'; code: string; message: string };

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
