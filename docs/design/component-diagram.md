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
            end
            
            subgraph Chat["Chat Components"]
                ChatPanel[ChatPanel]
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
            useAsyncState[useAsyncState]
        end
        
        subgraph Lib["Libraries"]
            apiClient[apiClient]
            errorUtils[errorUtils]
            formUtils[formUtils]
        end
        
        subgraph Providers["Providers"]
            I18nProvider[I18nProvider]
        end
    end
    
    Pages --> Components
    Components --> Hooks
    Components --> Lib
    Components --> Providers
    Hooks --> Lib
    Lib --> apiClient
```

## Backend Component Structure

```mermaid
graph TB
    subgraph Backend["Backend (Django)"]
        subgraph API["API Layer"]
            subgraph AuthAPI["Auth API"]
                AuthViews[Auth Views]
                AuthSerializers[Auth Serializers]
                AuthURLs[Auth URLs]
            end
            
            subgraph VideoAPI["Video API"]
                VideoViews[Video Views]
                VideoSerializers[Video Serializers]
                VideoURLs[Video URLs]
            end
            
            subgraph ChatAPI["Chat API"]
                ChatViews[Chat Views]
                ChatSerializers[Chat Serializers]
                ChatServices[RAG Chat Service]
                ChatURLs[Chat URLs]
            end
            
            subgraph MediaAPI["Media API"]
                MediaViews[Media Views]
            end
        end
        
        subgraph Models["Models Layer"]
            UserModel[User Model]
            VideoModel[Video Model]
            VideoGroupModel[VideoGroup Model]
            VideoGroupMemberModel[VideoGroupMember Model]
            ChatLogModel[ChatLog Model]
        end
        
        subgraph Services["Services Layer"]
            VectorManager[Vector Manager]
            EncryptionUtils[Encryption Utils]
            EmailUtils[Email Utils]
            TaskHelpers[Task Helpers]
            QueryOptimizer[Query Optimizer]
            VideoLimits["Video Limits (User.video_limit)"]
            ResponseUtils[Response Utils]
        end
        
        subgraph Tasks["Background Tasks"]
            TranscriptionTask["Transcription Task<br/>app.tasks.transcription"]
            AudioProcessing["Audio Processing<br/>app.tasks.audio_processing"]
            SRTProcessing["SRT Processing<br/>app.tasks.srt_processing"]
            VectorIndexing["Vector Indexing<br/>app.tasks.vector_indexing"]
        end
        
        subgraph Storage["Storage"]
            FileSystemStorage[File System Storage]
            S3Storage[S3 Storage]
        end
    end
    
    API --> Models
    API --> Services
    Tasks --> Models
    Tasks --> Services
    Models --> Storage
    Services --> VectorManager
    Services --> QueryOptimizer
    Services --> VideoLimits
    Services --> ResponseUtils
    ChatAPI --> ChatServices
    VideoAPI --> QueryOptimizer
    VideoAPI --> VideoLimits
    AuthAPI --> VideoLimits
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
