# Ubiquitous Language Guide (VideoQ)

This document defines the shared vocabulary used in specifications, Issues, PRs, code reviews, and tests.
Its purpose is to make terms executable: each key term describes behavior boundaries, not only names.

## 1. Bounded Contexts

- `Auth`:
  Authentication, account activation, API keys, password reset
- `Video`:
  Videos, tags, video groups, share links, transcription lifecycle
- `Chat`:
  Message sending, RAG responses, related scenes, analytics

## 2. Term Taxonomy

### 2.1 Domain Entities and Aggregates

- `UserEntity`
- `ApiKeyEntity`
- `VideoEntity`
- `TagEntity`
- `VideoGroupEntity` (aggregate root)
- `VideoGroupMemberEntity`
- `ChatLogEntity`
- `VideoGroupContextEntity`

### 2.2 Domain Policies and Services

- `ChatRequestPolicy`
- `ShareLinkService`
- `VideoTranscriptionLifecycle`
- `VideoGroupMembershipService`
- `TagPolicy`
- `VideoGroupPolicy`

### 2.3 Domain Request / Command Models

- `SignupRequest`
- `LoginAttempt`
- `RefreshSessionRequest`
- `UidTokenLink`
- `PasswordResetRequest`

### 2.4 Use-Case Boundary Terms

- `CreateVideoInput`, `UpdateVideoInput`, `ListVideosInput`
- `ChatMessageInput`
- `RelatedVideoResponseDTO`
- `SendMessageResultDTO`

### 2.5 External / API Terms

- `uidb64`, `token`
- `refresh`
- `group_id`
- `share_token`
- `messages`
- `related_videos`

## 3. Behavioral Contracts (Core Terms)

### 3.1 `VideoGroupEntity` (Video context aggregate root)

Responsibilities:
- Manage membership existence in a video group
- Maintain reorder consistency across existing members
- Manage share-link activation/deactivation state

Invariants:
- A video cannot be added twice to the same video group
- Reorder input must match member set and member count exactly
- Deactivation is invalid when no active share link exists

Allowed operations:
- `assert_can_add_video`
- `assert_contains_video`
- `plan_bulk_add` / `plan_bulk_add_with_existing`
- `assert_reorder_matches_members`
- `activate_share_link` / `deactivate_share_link`

Out of scope:
- Transcription status progression
- LLM answer generation
- Authentication and API-key authorization

### 3.2 `ChatRequestPolicy` (Chat access policy)

Responsibilities:
- Validate preconditions for send-message execution
- Resolve effective owner user in authenticated/shared flows
- Build group lookup parameters by access mode

Invariants:
- Empty message list is invalid
- Shared flow without `group_id` is invalid
- Owner user resolution must produce one effective user ID

Allowed operations:
- `validate_send_message_preconditions`
- `resolve_owner_user_id`
- `build_group_lookup_params`

Out of scope:
- LLM inference and answer generation
- Analytics aggregation and scene ranking
- Mutation of video-group membership

### 3.3 `VideoTranscriptionLifecycle` (Video status policy)

States:
- `pending`
- `processing`
- `indexing`
- `completed`
- `error`

Allowed transitions (source -> target):
- `pending -> processing`
- `processing -> indexing`
- `processing -> error`
- `indexing -> completed`
- `indexing -> error`
- `completed -> processing` (re-transcription)
- `error -> processing` (retry)

Forbidden transition examples:
- `pending -> completed`
- `completed -> error`
- `error -> completed`

Notes:
- Transition validation is defined by `VideoStatus.assert_transition_to`
- Lifecycle planning methods (`plan_start`, `plan_success`, `plan_failure`) are policy entry points used by use cases/tasks

## 4. API Terms to Domain / Use-Case Terms Mapping

| API / External Term | Internal Term | Notes |
| --- | --- | --- |
| `uidb64`, `token` | `UidTokenLink` | Auth context link normalization and resolution |
| `refresh` | `RefreshSessionRequest.refresh_token` | Session refresh request |
| `group_id` (chat API) | `VideoGroupContextEntity.id` | Chat context target group reference |
| `share_token` | `VideoGroupEntity.share_token` / `ChatRequestPolicy.share_token` | Shared-access identifier |
| `messages` | `ChatMessageInput[]` -> `ChatMessageDTO[]` | Use-case boundary to domain mapping |
| `related_videos` | `RelatedVideoResponseDTO[]` | Chat response scene references |
| `video_limit` | `UserEntity.video_limit` | Upload-count constraint |

## 5. Conversation Rules (Required)

- Declare context (`Auth`, `Video`, `Chat`) at the start of each specification thread
- If one term appears across contexts, always disambiguate with a prefix
  - Example: `Video group` vs `Chat group context`
- PR descriptions must include added/changed terms and impacted invariants
- Error messages must use nouns defined in this document (avoid synonyms)

## 6. Prohibited Ambiguous Terms

- `group` (without context)
  - Use `Video group` or `Chat group context`
- `token` (without context)
  - Use `share token`, `refresh token`, or `uid-token link token`
- `user` (without role)
  - Use `authenticated user`, `owner user`, or `group owner`

## 7. Update Policy

- For PRs introducing new concepts, update this file before implementation
- For naming changes, remove old terms or mark them deprecated
- For behavior changes, update at least one of:
  - invariants
  - allowed operations
  - state transitions
- Keep this document consistent with domain/use-case tests

## 8. Related Artifact

- `docs/architecture/domain-model-map.md` provides a single-view map of:
  - bounded contexts
  - clean-architecture dependency direction
  - `Video group` to Chat RAG interaction path
