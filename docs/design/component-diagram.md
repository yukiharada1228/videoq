# Component Diagram

## Overview

This diagram shows the major components of VideoQ's frontend and backend.

## Frontend Component Structure

```mermaid
graph TB
    subgraph Frontend["Frontend (Vite + React SPA)"]
        subgraph Pages["Pages (React Router Routes)"]
            Home[Home Page]
            Login[Login Page]
            Signup[Signup Page]
            Videos[Video List Page]
            VideoDetail[Video Detail Page]
            Groups[Group List Page]
            GroupDetail[Group Detail Page]
            Share[Share Page]
            Settings[Settings Page]
        end
        
        subgraph Components["Components"]
            subgraph Auth["Auth Components"]
                AuthForm[AuthForm]
                FormField[FormField]
                ErrorMessage[ErrorMessage]
            end
            
            subgraph Video["Video Components"]
                VideoList[VideoList]
                VideoCard[VideoCard]
                VideoUpload[VideoUpload]
                VideoUploadModal[VideoUploadModal]
                VideoNavBar[VideoNavBar]
            end

            subgraph Tag["Tag Components"]
                TagBadge[TagBadge]
                TagSelector[TagSelector]
                TagCreateDialog[TagCreateDialog]
                TagFilterPanel[TagFilterPanel]
                TagManagementModal[TagManagementModal]
            end
            
            subgraph Chat["Chat Components"]
                ChatPanel[ChatPanel]
            end

            subgraph Shorts["Shorts Components"]
                ShortsButton[ShortsButton]
                ShortsPlayer[ShortsPlayer]
            end
            
            subgraph Layout["Layout Components"]
                PageLayout[PageLayout]
                Header[Header]
                Footer[Footer]
            end
            
            subgraph Common["Common Components"]
                LoadingState[LoadingState]
                LoadingSpinner[LoadingSpinner]
                MessageAlert[MessageAlert]
            end
            
            subgraph UI["UI Components (shadcn/ui)"]
                Button[Button]
                Input[Input]
                Card[Card]
                Dialog[Dialog]
                Form[Form]
            end
        end
        
        subgraph Hooks["Custom Hooks"]
            useAuth[useAuth]
            useVideos[useVideos]
            useVideoUpload[useVideoUpload]
            useTags[useTags]
            QueryHooks[TanStack Query Hooks]
        end
        
        subgraph Lib["Libraries"]
            apiClient[apiClient]
            errorUtils[errorUtils]
            formUtils[formUtils]
        end
        
        subgraph Providers["Providers"]
            I18nProvider[I18nProvider]
            QueryProvider[QueryClientProvider]
        end
    end
    
    Pages --> Components
    Components --> Hooks
    Components --> Lib
    Components --> Providers
    Hooks --> Lib
    Lib --> apiClient
```

## Backend Component Structure (Clean Architecture)

```mermaid
graph TB
    subgraph Backend["Backend (Django - Clean Architecture)"]
        subgraph PresentationLayer["presentation/ — Thin HTTP layer"]
            subgraph AuthPres["auth/"]
                AuthViews[Views - Login, Signup, VerifyEmail, PasswordReset, CurrentUser, DeleteAccount, APIKeys]
                AuthSer[Serializers]
            end
            subgraph VideoPres["video/"]
                VideoViews[Views - VideoList, VideoDetail, VideoGroup, Tag]
                VideoSer[Serializers]
            end
            subgraph ChatPres["chat/"]
                ChatViews[Views - ChatView, ChatHistoryView]
                ChatSer[Serializers]
            end
            subgraph MediaPres["media/"]
                MediaViews[ProtectedMediaView]
            end
            CommonPres[common/ - auth, permissions, throttles]
        end

        subgraph UseCasesLayer["use_cases/ — Business logic"]
            subgraph VideoUC["video/"]
                CreateVideo[CreateVideoUseCase]
                GetVideo[GetVideoUseCase]
                ListVideos[ListVideosUseCase]
                UpdateVideo[UpdateVideoUseCase]
                GetGroup[GetGroupUseCase]
                GetTag[GetTagUseCase]
                FileUrl[GetVideoFileUrlUseCase]
                RunTrans[RunTranscriptionUseCase]
                ReindexAll[ReindexAllVideosUseCase]
            end
            subgraph ChatUC["chat/"]
                SendMsg[SendMessageUseCase]
            end
            subgraph AuthUC["auth/"]
                LoginUC[LoginUseCase]
                SignupUC[SignupUserUseCase]
                VerifyEmailUC[VerifyEmailUseCase]
                ResetPassUC[ConfirmPasswordResetUseCase]
                GetUserUC[GetCurrentUserUseCase]
                DeleteAccUC[AccountDeletionUseCase]
            end
            subgraph MediaUC["media/"]
                ResolveMedia[ResolveProtectedMediaUseCase]
            end
            SharedExc[shared/exceptions - ResourceNotFound, PermissionDenied]
        end

        subgraph DomainLayer["domain/ — Abstract interfaces & entities"]
            subgraph VideoDomain["video/"]
                VideoEntity[VideoEntity]
                VideoRepo[VideoRepository ABC]
                VideoGateways[VideoTaskGateway, VectorIndexingGateway, TranscriptionGateway]
            end
            subgraph ChatDomain["chat/"]
                ChatRepo[ChatRepository ABC]
                RagGateway[RagGateway ABC]
                KwExtractor[KeywordExtractor ABC]
            end
            subgraph AuthDomain["auth/"]
                UserRepo[UserRepository ABC]
                AuthGateways[TokenGateway, UserAuthGateway, UserManagementGateway, AuthTaskGateway]
            end
            subgraph MediaDomain["media/"]
                MediaRepo[ProtectedMediaRepository ABC]
            end
            UserEntity[user/UserEntity]
        end

        subgraph InfraLayer["infrastructure/ — Implementations"]
            subgraph Repos["repositories/"]
                DjangoVideoRepo[DjangoVideoRepository]
                DjangoChatRepo[DjangoChatRepository]
                DjangoUserRepo[DjangoUserRepository]
                DjangoMediaRepo[DjangoMediaRepository]
            end
            subgraph ExtGateways["external/"]
                RagChatGW[RagChatGateway]
                VectorGW[DjangoVectorIndexingGateway]
                TransGW[WhisperTranscriptionGateway]
                SceneIdx[scene_indexer]
                VectorStore[PGVector / vector_store]
                RagSvc[rag_service / LangChain]
            end
            subgraph TranscriptionInfra["transcription/"]
                AudioProc[audio_processing - ffmpeg/Whisper]
                SRTProc[srt_processing - SRT parsing]
                VideoAccessor[DjangoVideoFileAccessor]
            end
            subgraph AuthInfra["auth/"]
                SimpleJWT[SimpleJWTGateway]
                DjangoAuthGW[DjangoUserAuthGateway]
                CookieJWT[CookieJWTValidator]
            end
            subgraph TasksInfra["tasks/"]
                CeleryVideoGW[CeleryVideoTaskGateway]
                CeleryAuthGW[CeleryAuthTaskGateway]
            end
            ChatInfra[chat/ - JanomeNltkKeywordExtractor]
        end

        subgraph Models["models/ — Django ORM (unchanged)"]
            UserModel[User]
            VideoModel[Video]
            GroupModel[VideoGroup / VideoGroupMember]
            ChatLogModel[ChatLog]
            TagModel[Tag / VideoTag]
        end

        subgraph Tasks["tasks/ (Celery entrypoints - thin triggers)"]
            TranscribeTask[transcription.py]
            DeleteAccTask[account_deletion.py]
            ReindexTask[reindexing.py]
        end

        subgraph Container["Dependency Providers / Composition Root"]
            Dependencies[dependencies/*.py - provider functions]
            CompRoot[composition_root/*.py - wiring and assembly]
            Contracts[contracts/ - task name constants]
        end
    end

    PresentationLayer --> Container
    Container --> UseCasesLayer
    Container --> InfraLayer
    UseCasesLayer --> DomainLayer
    InfraLayer --> DomainLayer
    InfraLayer --> Models
    Tasks --> UseCasesLayer
    Tasks --> Contracts
```

## System-Wide Component Structure

```mermaid
graph TB
    subgraph Client["Client"]
        Browser[Web Browser]
    end
    
    subgraph Frontend["Frontend"]
        FrontendSPA[Vite + React SPA]
        ReactComponents[React Components]
    end
    
    subgraph Gateway["Gateway"]
        Nginx[Nginx Reverse Proxy]
    end
    
    subgraph Backend["Backend"]
        DjangoAPI[Django REST API]
        CeleryWorker[Celery Worker]
    end
    
    subgraph Data["Data Layer"]
        PostgreSQL[(PostgreSQL + pgvector)]
        Redis[(Redis)]
        FileStorage[(File Storage / S3)]
    end
    
    subgraph External["External Services"]
        OpenAI[OpenAI API]
        EmailService[Email Service]
    end
    
    Browser --> Nginx
    Nginx --> FrontendSPA
    Nginx --> DjangoAPI
    FrontendSPA --> DjangoAPI
    DjangoAPI --> PostgreSQL
    DjangoAPI --> Redis
    DjangoAPI --> FileStorage
    CeleryWorker --> Redis
    CeleryWorker --> PostgreSQL
    CeleryWorker --> FileStorage
    CeleryWorker --> OpenAI
    DjangoAPI --> OpenAI
    DjangoAPI --> EmailService
    DjangoAPI --> PostgreSQL
```

## Component Dependencies

### Frontend
- **Pages** → **Components**: Pages use components
- **Components** → **Hooks**: Components use custom hooks
- **Hooks** → **Lib**: Hooks use libraries
- **Components** → **UI Components**: Use common UI components

### Backend
- **API Layer** → **Models**: API uses models
- **API Layer** → **Services**: API uses service layer
- **Tasks** → **Models**: Tasks use models
- **Tasks** → **Services**: Tasks use service layer
- **Models** → **Storage**: Models use storage

### System-Wide
- **Client** → **Gateway**: Client accesses via gateway
- **Gateway** → **Frontend/Backend**: Gateway routes requests
- **Backend** → **Data**: Backend uses data layer
- **Backend** → **External**: Backend uses external services
