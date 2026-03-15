# コンポーネント図

## 概要

VideoQのフロントエンドとバックエンドの主要コンポーネントを、現行実装に沿って示す図です。

## フロントエンドコンポーネント構成

```mermaid
graph TB
    subgraph Frontend["Frontend (Vite + React SPA)"]
        subgraph Pages["Pages (React Router Routes)"]
            Home[Home Page]
            Login[Login Page]
            Signup[Signup Page]
            SignupCheckEmail[Signup Check Email Page]
            ForgotPassword[Forgot Password Page]
            ResetPassword[Reset Password Page]
            VerifyEmail[Verify Email Page]
            Videos[Video List Page]
            VideoDetail[Video Detail Page]
            Groups[Group List Page]
            GroupDetail[Group Detail Page]
            Share[Share Page]
            Settings[Settings Page]
            DevDocs[Developer Docs Page]
            DevDocsSection[Developer Docs Section Page]
        end
        
        subgraph Components["Components"]
            subgraph Auth["Auth Components"]
                AuthForm[AuthForm]
                FormField[FormField]
                AuthFormFooter[AuthFormFooter]
                ErrorMessage[ErrorMessage]
            end
            
            subgraph Video["Video Components"]
                VideoList[VideoList]
                VideoCard[VideoCard]
                VideoUpload[VideoUpload]
                VideoUploadButton[VideoUploadButton]
                VideoUploadFormFields[VideoUploadFormFields]
                VideoUploadModal[VideoUploadModal]
                VideoNavBar[VideoNavBar]
                AddToGroupModal[AddToGroupModal]
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

            subgraph Dashboard["Dashboard Components"]
                AnalyticsDashboard[AnalyticsDashboard]
                DashboardButton[DashboardButton]
                DashboardEmptyState[DashboardEmptyState]
                FeedbackDonutChart[FeedbackDonutChart]
                KeywordCloudChart[KeywordCloudChart]
                QuestionTimeSeriesChart[QuestionTimeSeriesChart]
                SceneDistributionChart[SceneDistributionChart]
            end
            
            subgraph Layout["Layout Components"]
                PageLayout[PageLayout]
                Header[Header]
                Footer[Footer]
            end
            
            subgraph Common["Common Components"]
                LoadingState[LoadingState]
                LoadingSpinner[LoadingSpinner]
                InlineSpinner[InlineSpinner]
                MessageAlert[MessageAlert]
            end
            
            subgraph UI["UI Components (Radix UI + Tailwind CSS)"]
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
            useChatMessages[useChatMessages]
            useChatHistory[useChatHistory]
            useChatAnalytics[useChatAnalytics]
            useVideoGroups[useVideoGroups]
            useShareLink[useShareLink]
            useVideoEditing[useVideoEditing]
            useVideoPlayback[useVideoPlayback]
            useVideoStats[useVideoStats]
            QueryHooks[TanStack Query Hooks]
        end
        
        subgraph FrontendModules["Frontend Internal Modules"]
            apiClient[apiClient]
            queryClient[queryClient]
            i18nConfig[i18n config]
            errorUtils[errorUtils]
            formUtils[formUtils]
        end

        subgraph Lib["External Libraries"]
            TanStackQuery[TanStack Query]
            ReactI18next[react-i18next]
        end
        
        subgraph Providers["Providers"]
            I18nProvider[I18nProvider]
            QueryProvider[QueryClientProvider]
        end
    end
    
    Pages --> Components
    Components --> Hooks
    Components --> FrontendModules
    Components --> Providers
    Hooks --> FrontendModules
    Hooks --> Lib
    Providers --> Lib
    Pages --> ReactI18next
```

## バックエンドコンポーネント構成（クリーンアーキテクチャ）

```mermaid
graph TB
    subgraph Backend["Backend (Django ASGI - Clean Architecture)"]
        subgraph PresentationLayer["presentation/ — Thin HTTP layer"]
            subgraph AuthPres["auth/"]
                AuthViews["Views - Login, Logout, Signup, VerifyEmail,
                PasswordResetRequest, PasswordResetConfirm,
                Me, DeleteAccount, ApiKeyListCreate,
                ApiKeyDetail, Refresh"]
                AuthSer[Serializers]
            end
            subgraph VideoPres["video/"]
                VideoViews["Views - VideoList, VideoDetail,
                VideoGroupList, VideoGroupDetail,
                AddVideoToGroup, AddVideosToGroup,
                ReorderVideosInGroup, ShareLink, SharedGroup,
                TagList, TagDetail, AddTagsToVideo,
                RemoveVideoFromGroup, RemoveTagFromVideo"]
                VideoSer[Serializers]
            end
            subgraph ChatPres["chat/"]
                ChatViews["Views - ChatView, ChatSearchView, ChatHistoryView,
                ChatFeedbackView, ChatAnalyticsView,
                PopularScenesView, ChatHistoryExportView"]
                ChatSer[Serializers]
            end
            subgraph MediaPres["media/"]
                MediaViews[ProtectedMediaView]
            end
            CommonPres["common/ - auth (CookieJWTAuthentication,
            ApiKeyAuthentication, ShareTokenAuthentication),
            permissions, throttles"]
            AdminPres[admin.py - operational privileged path]
        end

        subgraph UseCasesLayer["use_cases/ — Business logic"]
            subgraph VideoUC["video/"]
                CreateVideo[CreateVideoUseCase]
                GetVideo[GetVideoDetailUseCase]
                ListVideos[ListVideosUseCase]
                UpdateVideo[UpdateVideoUseCase]
                DeleteVideo[DeleteVideoUseCase]
                FileUrl[GetVideoFileUrlUseCase]
                EnforceLimit[EnforceVideoLimitUseCase]
                CreateGroup[CreateVideoGroup / CreateVideoGroupWithDetail]
                GetGroup[GetVideoGroupUseCase / GetSharedGroupUseCase]
                ListGroups[ListVideoGroupsUseCase]
                UpdateGroup[UpdateVideoGroup / UpdateVideoGroupWithDetail]
                DeleteGroup[DeleteVideoGroupUseCase]
                ManageGroups["AddVideoToGroup, AddVideosToGroup,
                RemoveVideoFromGroup, ReorderVideosInGroup,
                CreateShareLink, DeleteShareLink"]
                CreateTag[CreateTagUseCase]
                GetTag[GetTagDetailUseCase]
                ListTags[ListTagsUseCase]
                UpdateTag[UpdateTag / UpdateTagWithDetail]
                DeleteTag[DeleteTagUseCase]
                ManageTags[AddTagsToVideo / RemoveTagFromVideo]
                RunTrans[RunTranscriptionUseCase]
                IndexTrans[IndexVideoTranscriptUseCase]
                ReindexAll[ReindexAllVideosUseCase]
            end
            subgraph ChatUC["chat/"]
                SendMsg[SendMessageUseCase]
                SearchRelated[SearchRelatedVideosUseCase]
                GetHistory[GetChatHistoryUseCase]
                ExportHistory[ExportChatHistoryUseCase]
                SubmitFeedback[SubmitFeedbackUseCase]
                GetAnalytics[GetChatAnalyticsUseCase]
                GetPopularScenes[GetPopularScenesUseCase]
            end
            subgraph AuthUC["auth/"]
                LoginUC[LoginUseCase]
                SignupUC[SignupUserUseCase]
                VerifyEmailUC[VerifyEmailUseCase]
                RequestResetUC[RequestPasswordResetUseCase]
                ResetPassUC[ConfirmPasswordResetUseCase]
                GetUserUC[GetCurrentUserUseCase]
                DeleteAccUC[AccountDeletionUseCase]
                DeleteAccDataUC[DeleteAccountDataUseCase]
                ApiKeysUC[ListApiKeys / CreateApiKey / RevokeApiKey]
                AuthorizeApiKeyUC[AuthorizeApiKeyUseCase]
                ResolveApiKeyUC[ResolveApiKeyUseCase]
                ResolveShareUC[ResolveShareTokenUseCase]
                RefreshTokenUC[RefreshTokenUseCase]
            end
            subgraph MediaUC["media/"]
                ResolveMedia[ResolveProtectedMediaUseCase]
            end
            SharedExc["shared/exceptions - ResourceNotFound, PermissionDenied"]
        end

        subgraph DomainLayer["domain/ — Abstract interfaces & entities"]
            subgraph VideoDomain["video/"]
                VideoEntity[VideoEntity, VideoGroupEntity, TagEntity]
                VideoRepo["VideoRepository ABC
                (VideoQueryRepository,
                VideoCommandRepository,
                VideoTranscriptionRepository)"]
                VideoGroupRepo[VideoGroupRepository ABC]
                TagRepo[TagRepository ABC]
                VideoGateways["VectorStoreGateway,
                VideoTaskGateway,
                VectorIndexingGateway,
                TranscriptionGateway"]
                VideoPorts[FileUrlResolver]
            end
            subgraph ChatDomain["chat/"]
                ChatRepo[ChatRepository ABC]
                ChatGroupRepo[VideoGroupQueryRepository ABC]
                RagGateway[RagGateway ABC]
                ChatPorts["KeywordExtractor,
                SceneVideoInfoProvider"]
                ChatServices["services - aggregate_scenes,
                filter_group_scenes"]
                ChatVOs["value_objects - ChatSceneLog, KeywordCount"]
            end
            subgraph AuthDomain["auth/"]
                ApiKeyRepo[ApiKeyRepository ABC]
                AuthGateways["AccountDeletionGateway,
                UserManagementGateway,
                UserDataDeletionGateway,
                EmailSenderGateway,
                AuthTaskGateway"]
                AuthPorts["TokenGateway, UserAuthGateway,
                ShareTokenResolverPort,
                ApiKeyResolverPort"]
            end
            subgraph MediaDomain["media/"]
                MediaRepo[ProtectedMediaRepository ABC]
            end
            UserEntity["user/ - UserEntity, UserRepository ABC"]
            SharedDomain["shared/ - ResourceNotFound, PermissionDenied"]
        end

        subgraph InfraLayer["infrastructure/ — Implementations"]
            subgraph Repos["repositories/"]
                DjangoVideoRepo[DjangoVideoRepository]
                DjangoChatRepo[DjangoChatRepository]
                DjangoUserRepo[DjangoUserRepository]
                DjangoMediaRepo[DjangoMediaRepository]
                DjangoAccDeleteRepo[DjangoAccountDeletionRepository]
                DjangoApiKeyRepo[DjangoApiKeyRepository]
                DjangoUserAuthGW[DjangoUserAuthGateway]
                DjangoUserDataGW[DjangoUserDataDeletionGateway]
            end
            subgraph ExtGateways["external/"]
                RagChatGW[RagChatGateway]
                VectorGW[DjangoVectorIndexingGateway]
                VectorStoreGW[DjangoVectorStoreGateway]
                TransGW[WhisperTranscriptionGateway]
                FileUrlResolver[DjangoFileUrlResolver]
                SceneIdx[scene_indexer]
                VectorStore[PGVector / vector_store]
                RagSvc[rag_service / LangChain]
                LlmModule[llm - LLM provider factory]
                PromptsModule[prompts/ - RAG prompt templates]
            end
            subgraph TranscriptionInfra["transcription/"]
                AudioProc[audio_processing - ffmpeg/Whisper]
                SRTProc[srt_processing - SRT parsing]
                VideoAccessor[DjangoVideoFileAccessor]
            end
            subgraph AuthInfra["auth/"]
                SimpleJWT[SimpleJWTGateway]
                DjangoAuthGW[DjangoAuthGateway]
                CookieJWT[CookieJWTValidator]
                ApiKeyResolver[ApiKeyResolver]
                ShareTokenResolver[ShareTokenResolver]
            end
            subgraph TasksInfra["tasks/"]
                CeleryTaskGW[CeleryTaskGateway]
            end
            subgraph ChatInfra["chat/"]
                KwExtractor[JanomeNltkKeywordExtractor]
                SceneInfoProvider[DjangoSceneVideoInfoProvider]
            end
            subgraph CommonInfra["common/"]
                EmailModule[email - SMTP sender]
                EmbeddingsModule[embeddings - embedding factory]
                WhisperClient[whisper_client]
                QueryOptimizer[query_optimizer]
                PerfUtils[performance_utils]
                TaskHelpers[task_helpers]
            end
            subgraph SceneOtsu["scene_otsu/"]
                Splitter[splitter - scene splitting]
                Parsers[parsers - SRT/transcript parsing]
                Embedders[embedders - embedding generation]
            end
            StorageInfra[storage/ - LocalMediaStorage]
        end

        subgraph Models["models/ — Django ORM"]
            UserModel[User]
            VideoModel[Video]
            GroupModel[VideoGroup / VideoGroupMember]
            ChatLogModel[ChatLog]
            TagModel[Tag / VideoTag]
            AccDeleteModel[AccountDeletionRequest]
            ApiKeyModel[UserApiKey]
            StorageModel["SafeFileSystemStorage /
            SafeS3Boto3Storage"]
        end

        subgraph Tasks["entrypoints/tasks/ (Celery entrypoints - thin triggers)"]
            TranscribeTask[transcription.py]
            DeleteAccTask[account_deletion.py]
            ReindexTask[reindexing.py]
        end

        subgraph Container["Dependency Providers / Composition Root"]
            Dependencies[dependencies/*.py - provider functions]
            CompRoot[composition_root/*.py - wiring and assembly]
            VideoProviders[_video_*_providers.py]
            Contracts[contracts/ - task name constants]
        end
    end

    PresentationLayer --> Container
    AdminPres --> Container
    Container --> UseCasesLayer
    Container --> InfraLayer
    UseCasesLayer --> DomainLayer
    InfraLayer --> DomainLayer
    InfraLayer --> Models
    Tasks --> UseCasesLayer
    Tasks --> Contracts
```

## システム全体のコンポーネント構成

```mermaid
graph TB
    subgraph Client["Client"]
        Browser[Web Browser]
    end
    
    subgraph Frontend["Frontend"]
        FrontendSPA[Vite-built React SPA]
        ReactComponents[React Components]
    end
    
    subgraph Gateway["Gateway"]
        Nginx[Nginx Reverse Proxy]
    end
    
    subgraph Backend["Backend"]
        DjangoAPI[Django ASGI API]
        CeleryWorker[Celery Worker]
    end
    
    subgraph Data["Data Layer"]
        PostgreSQL[(PostgreSQL + pgvector)]
        Redis[(Redis)]
        FileStorage[(File Storage / S3)]
    end
    
    subgraph External["External Services"]
        OpenAI[OpenAI API / Ollama / whisper.cpp]
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

## コンポーネント依存関係

### フロントエンド
- **Pages** → **Components**: ページがコンポーネントを使用
- **Components** → **Hooks**: コンポーネントがカスタムフックを使用
- **Hooks** → **Lib**: フックがライブラリを使用
- **Components** → **UI Components**: 共通UIコンポーネントを使用

### バックエンド
- **Presentation (`presentation/*`, `admin.py`)** → **Dependencies (`dependencies/*.py`)**: フレームワークのエントリーポイントはdependencies経由でのみプロバイダーを解決
- **Dependencies** → **Composition Root (`composition_root/*.py`)**: プロバイダー関数は配線関数や `_video_*_providers.py` に委譲
- **Composition Root** → **Use Cases / Infrastructure**: 具体的なアダプターとユースケースインスタンスを組み立て
- **Use Cases** → **Domain ports/entities**: ビジネスロジックはドメインの抽象のみに依存
- **Infrastructure** → **Domain + ORM/External**: アダプター実装がドメインポートとDjango ORM/外部サービスを橋渡し
- **Entrypoints (`entrypoints/tasks/`)** → **Use Cases**: Celeryタスクエントリーポイントがcomposition root経由でユースケースに委譲

### システム全体
- **Client** → **Gateway**: クライアントがゲートウェイ経由でアクセス
- **Gateway** → **Frontend/Backend**: ゲートウェイがリクエストをルーティング
- **Backend** → **Data**: バックエンドがデータ層を使用
- **Backend** → **External**: バックエンドが外部サービスを使用

---

## Related Documentation

- [📖 ドキュメント一覧](../README.md)
- [クラス図](class-diagram.md) — モデル・ユースケース・ビューの詳細
- [システム構成図](../architecture/system-configuration-diagram.md) — 全体アーキテクチャ
- [画面遷移図](../requirements/screen-transition-diagram.md) — フロントエンドの画面遷移
- [デプロイメント図](deployment-diagram.md) — Docker Compose構成
