# Domain Model Map

## Overview

This document provides a single-view domain map for VideoQ across:

- Bounded contexts (`Auth`, `Video`, `Chat`)
- Clean Architecture dependency direction
- Core interaction path between `Video group` and Chat RAG flows

## 1. Context Map (DDD)

```mermaid
flowchart LR
    subgraph Auth[Auth Context]
        AuthTerms[SignupRequest\nLoginAttempt\nRefreshSessionRequest\nUidTokenLink\nPasswordResetRequest\nApiKeyEntity]
    end

    subgraph Video[Video Context]
        VideoTerms[VideoEntity\nTagEntity\nVideoGroupEntity\nVideoGroupMemberEntity\nShareLinkService\nVideoTranscriptionLifecycle]
    end

    subgraph Chat[Chat Context]
        ChatTerms[ChatRequestPolicy\nChatLogEntity\nVideoGroupContextEntity\nChatAnalyticsRaw]
    end

    Video -->|share token + group members| Chat
    Auth -->|authenticated user / API key scopes| Video
    Auth -->|authenticated user / API key scopes| Chat
```

## 2. Layer and Dependency Map (Clean Architecture)

```mermaid
flowchart TB
    subgraph Presentation[presentation]
        P1[auth/views.py]
        P2[video/views.py]
        P3[chat/views.py]
        P4[media/views.py]
    end

    subgraph UseCases[use_cases]
        U1[Auth Use Cases]
        U2[Video Use Cases]
        U3[Chat Use Cases]
        U4[Media Use Cases]
    end

    subgraph Domain[domain]
        D1[Entities / Value Objects]
        D2[Policies / Services]
        D3[Repository & Gateway Ports]
    end

    subgraph Infra[infrastructure]
        I1[Django ORM Repositories]
        I2[External Gateways\nLLM / Vector / Storage / Tasks]
    end

    subgraph Composition[dependencies + composition_root]
        C1[Provider Wiring]
    end

    Presentation --> UseCases
    UseCases --> Domain
    UseCases --> D3
    Infra --> D3
    Composition --> UseCases
    Composition --> Infra
```

## 3. `Video group` and Chat RAG Interaction

```mermaid
sequenceDiagram
    participant Client as Client
    participant PV as presentation/chat/views.py
    participant SU as SendMessageUseCase
    participant CP as ChatRequestPolicy
    participant GQ as VideoGroupQueryRepository
    participant RG as RagGateway
    participant CR as ChatRepository

    Client->>PV: POST /chat (group_id?, share_token?, messages)
    PV->>SU: execute(user_id, messages, group_id, share_token, is_shared)
    SU->>CP: validate_send_message_preconditions()
    alt group_id is provided
        SU->>CP: build_group_lookup_params()
        SU->>GQ: get_with_members(group_id, user_id/share_token)
        GQ-->>SU: VideoGroupContextEntity(members)
    end
    SU->>CP: resolve_owner_user_id(group_user_id)
    SU->>RG: generate_reply(messages, owner_user_id, member_video_ids)
    RG-->>SU: rag_result(content, related_videos)
    opt group context exists
        SU->>CR: create_log(...)
    end
    SU-->>PV: SendMessageResultDTO
    PV-->>Client: response
```

## 4. Aggregate and Invariant Focus

### 4.1 `VideoGroupEntity` (Video aggregate root)

- Owns membership consistency inside a video group
- Owns reorder consistency (ID set and count must match existing members)
- Owns share-link state consistency (`activate` / `deactivate`)

### 4.2 `ChatRequestPolicy` (Chat policy)

- Validates chat execution preconditions
- Resolves effective owner user in shared and authenticated flows
- Builds group-lookup parameters without leaking transport concerns

### 4.3 `VideoTranscriptionLifecycle` (Video lifecycle policy)

Canonical states:

- `pending`
- `processing`
- `indexing`
- `completed`
- `error`

Transition source of truth: `app/domain/video/status.py`.

## 5. Boundary Notes

- `Video group` is a Video-context concept; Chat consumes it as `VideoGroupContextEntity` for retrieval scope only.
- `share token` is cross-context input, but ownership and mutation live in Video context.
- `messages` are external/use-case inputs and are mapped to domain DTOs before gateway calls.
- Infrastructure implements ports only; domain and use cases must not import infrastructure directly.
