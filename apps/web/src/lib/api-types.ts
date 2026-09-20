import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter, Page, PlogWaypoint } from '@videoq/trpc';

type RouterInputs = inferRouterInputs<AppRouter>;
type RouterOutputs = inferRouterOutputs<AppRouter>;

/**
 * UI names for the inferred tRPC contract. Keep aliases here so components do
 * not duplicate response interfaces or cast client results.
 */
export type PaginatedResponse<T> = Page<T>;
export type User = RouterOutputs['account']['me'];
export type AdminUser = RouterOutputs['admin']['getUser'];
export type AdminQuotaPatch = Omit<RouterInputs['admin']['patchQuota'], 'id'>;
export type AdminUsagePatch = Omit<RouterInputs['admin']['patchUsage'], 'id'>;
export type AdminFlagsPatch = Omit<RouterInputs['admin']['patchFlags'], 'id'>;
export type BillingPlan = RouterOutputs['billing']['plans'][number];
export type SearchApiKeyStatus = RouterOutputs['account']['searchApiKeyStatus'];

export type ChatMessage = RouterOutputs['chat']['send'];
export type StudySessionInfo = NonNullable<ChatMessage['study_session']>;
export type Citation = NonNullable<ChatMessage['citations']>[number];
export type ChatHistoryItem = RouterOutputs['chat']['history']['data'][number];
export type ChatAnalytics = RouterOutputs['chat']['analytics'];
export type EvaluationSummary = RouterOutputs['evaluation']['summary'];
export type ChatLogEvaluation = RouterOutputs['evaluation']['logs']['data'][number];
export type EvaluationStatus = ChatLogEvaluation['status'];

export type Video = RouterOutputs['videos']['get'];
export type VideoList = RouterOutputs['videos']['list']['data'][number];
export type VideoStatusCounts = RouterOutputs['videos']['statusCounts'];
export type UploadRequestResponse = RouterOutputs['videos']['requestUpload'];
export type VideoUpdateRequest = Omit<RouterInputs['videos']['update'], 'id'>;

export type VideoCourse = RouterOutputs['courses']['get'];
export type VideoCourseList = RouterOutputs['courses']['list']['data'][number];
export type VideoInCourse = NonNullable<VideoCourse['videos']>[number];
export type VideoCourseCreateRequest = RouterInputs['courses']['create'];
export type VideoCourseUpdateRequest = Omit<RouterInputs['courses']['update'], 'id'>;

export type CourseParticipants = RouterOutputs['courseMemberships']['participants'];
export type CourseInvitationListItem = CourseParticipants['invitations'][number];
export type CourseUserMember = CourseParticipants['members'][number];
export type CourseInvitationPreview = RouterOutputs['courseMemberships']['preview'];
export type CourseInvitationStatus = CourseInvitationPreview['status'];
export type CourseInvitationDeliveryStatus =
  RouterOutputs['courseMemberships']['resend']['delivery_status'];
export type CourseInviteRecipientResult =
  RouterOutputs['courseMemberships']['invite']['results'][number];

export type Tag = RouterOutputs['tags']['list']['data'][number];
export type TagDetail = RouterOutputs['tags']['get'];
export type TagCreateRequest = RouterInputs['tags']['create'];
export type TagUpdateRequest = Omit<RouterInputs['tags']['update'], 'id'>;

export type PlogConcept = RouterOutputs['plog']['graph']['concepts'][number];
export type PlogEdge = RouterOutputs['plog']['graph']['edges'][number];
export type PlogGraph = RouterOutputs['plog']['graph'];
export type PlogLearnerState = RouterOutputs['plog']['learnerState']['states'][number];
export type { PlogWaypoint };

// Better Auth and raw-transport request/response types are intentionally not
// part of the tRPC router.
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
  mode?: 'qa' | 'study';
  /** Tab-scoped study progress key, per course or share link (sessionStorage). */
  study_session_id?: string;
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
      study_session?: StudySessionInfo;
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
