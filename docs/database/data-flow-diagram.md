# Data Flow Diagram

## Overview

This diagram represents the data flow in the VideoQ system.

## 1. Data Flow from Video Upload to Transcription

```mermaid
flowchart TD
    Start([User]) --> Upload[Upload Video File]
    Upload --> Frontend[Frontend]
    Frontend --> API[Backend API]
    
    API --> Validate{"Validation<br>- File<br>- User.video_limit"}
    Validate -->|Invalid| Error[Error Response]
    Validate -->|Valid| SaveDB[(Database<br/>Save Video)]
    
    SaveDB --> CreateRecord[Create Video Record<br/>status: pending]
    CreateRecord --> Queue[Redis Queue<br/>Task Queue]
    
    Queue --> Worker[Celery Worker]
    Worker --> ReadDB[(Database<br/>Read Video)]
    ReadDB --> UpdateStatus[Update status: processing]
    UpdateStatus --> SaveDB2[(Database<br/>Update)]
    
    SaveDB2 --> CheckAPIKey{"OpenAI API Key Configured?<br>(Video Owner)"}
    CheckAPIKey -->|Not Configured| Error2[Update status: error<br/>Save Error Message]
    CheckAPIKey -->|Configured| ReadFile[File Storage<br/>Read Video File]
    
    Worker --> ReadFile[File Storage<br/>Read Video File]
    ReadFile --> Extract[Extract Audio<br/>ffmpeg]
    Extract --> Transcribe[Whisper API<br/>Transcription]
    Transcribe --> SRT[Convert to SRT Format]
    SRT --> SceneSplit[Scene Splitting]
    
    SceneSplit --> SaveTranscript[Database<br/>Save transcript]
    SaveTranscript --> Vectorize[PGVector<br/>Vectorize and Save]
    Vectorize --> UpdateComplete[Update status: completed]
    UpdateComplete --> SaveDB3[(Database<br/>Final Update)]
    
    Error --> Frontend
    Error2 --> Frontend
    SaveDB3 --> Frontend
    Frontend --> End([User])
```

## 2. Chat Processing (RAG) Data Flow

```mermaid
flowchart TD
    Start([User]) --> Input[Input Question]
    Input --> Frontend[Frontend]
    Frontend --> API[Backend API<br/>/api/chat/]
    
    API --> Auth{Authentication Check}
    Auth -->|Failed| Error1[Authentication Error]
    Auth -->|Success| GetAPIKey[Get OpenAI API Key<br>(User)]
    
    GetAPIKey --> GetGroup[(Database<br/>Get VideoGroup)]
    
    GetGroup --> VectorSearch[PGVector<br/>Vector Search]
    VectorSearch --> RelatedScenes[Get Related Scenes]
    RelatedScenes --> BuildContext[Build Context]
    
    BuildContext --> LLM[OpenAI API<br/>LLM Call]
    LLM --> Answer[Generate Answer]
    
    Answer --> SaveLog[(Database<br/>Save ChatLog)]
    SaveLog --> Response[Generate Response]
    Response --> Frontend
    Frontend --> End([User])
    
    Error1 --> Frontend
```

## 3. Group Management Data Flow

```mermaid
flowchart TD
    Start([User]) --> Action{Select Operation}
    
    Action -->|Create| Create[Create Group]
    Action -->|Add| Add[Add Video]
    Action -->|Reorder| Reorder[Reorder]
    
    Create --> API1[POST /api/videos/groups/]
    Add --> API2[POST /api/videos/groups/<id>/videos/]
    Reorder --> API3[PATCH /api/videos/groups/<id>/reorder/]
    
    API1 --> Validate1{Validation}
    API2 --> Validate2{Validation}
    API3 --> Validate3{Validation}
    
    Validate1 -->|Success| Save1[(Database<br/>Create VideoGroup)]
    Validate2 -->|Success| Check[(Database<br/>Verify Ownership)]
    Validate3 -->|Success| Check2[(Database<br/>Get Group)]
    
    Check --> Save2[(Database<br/>Create VideoGroupMember)]
    Check2 --> Update[(Database<br/>Bulk Update Order)]
    
    Save1 --> Response1[Response]
    Save2 --> Response2[Response]
    Update --> Response3[Response]
    
    Response1 --> Frontend
    Response2 --> Frontend
    Response3 --> Frontend
    Frontend --> End([User])
    
    Validate1 -->|Failed| Error1[Error]
    Validate2 -->|Failed| Error2[Error]
    Validate3 -->|Failed| Error3[Error]
    Error1 --> Frontend
    Error2 --> Frontend
    Error3 --> Frontend
```

## 4. Sharing Feature Data Flow

```mermaid
flowchart TD
    Start1([Owner]) --> Generate[Generate Share Link]
    Generate --> API1[POST /api/videos/groups/<id>/share/]
    API1 --> Validate1[(Database<br/>Verify Ownership)]
    Validate1 --> GenerateToken[Generate Token]
    GenerateToken --> SaveToken[(Database<br/>Save share_token)]
    SaveToken --> ReturnURL[Return Share URL]
    ReturnURL --> Share[Send Share URL]
    
    Share --> Guest([Guest])
    Guest --> Access[Access Share URL]
    Access --> Frontend[Frontend]
    Frontend --> API2[GET /api/videos/groups/shared/<token>/]
    
    API2 --> ValidateToken[(Database<br/>Verify Token)]
    ValidateToken --> GetGroup[(Database<br/>Get VideoGroup)]
    GetGroup --> GetVideos[(Database<br/>Get Related Videos)]
    GetVideos --> Response[Return Group Information]
    Response --> Frontend
    Frontend --> Guest
    
    Guest --> Chat[Send Chat]
    Chat --> API3[POST /api/chat/?share_token=<token>]
    API3 --> ValidateToken2[(Database<br/>Verify Token)]
    ValidateToken2 --> GetAPIKey[Get OpenAI API Key<br>(Group Owner)]
    GetAPIKey --> RAG[RAG Processing]
    RAG --> SaveLog[(Database<br/>Save ChatLog<br/>is_shared_origin: True)]
    SaveLog --> ReturnAnswer[Return Answer]
    ReturnAnswer --> Frontend
    Frontend --> Guest
```

## 5. Authentication Data Flow

```mermaid
flowchart TD
    Start([User]) --> Action{Operation}
    
    Action -->|Sign Up| Signup[Sign Up]
    Action -->|Login| Login[Login]
    Action -->|Refresh| Refresh[Token Refresh]
    
    Signup --> API1[POST /api/auth/signup/]
    Login --> API2[POST /api/auth/login/]
    Refresh --> API3[POST /api/auth/refresh/]
    
    API1 --> Validate1{Input Validation}
    Validate1 -->|Invalid| Error1[Error]
    Validate1 -->|Valid| CreateUser[(Database<br/>Create User<br/>is_active: False)]
    CreateUser --> GenerateToken[Generate Verification Token]
    GenerateToken --> SendEmail[Send Email]
    SendEmail --> Response1[Success Response]
    
    API2 --> Validate2{Credential Verification}
    Validate2 -->|Invalid| Error2[Authentication Error]
    Validate2 -->|Valid| GetUser[(Database<br/>Get User)]
    GetUser --> GenerateJWT[Generate JWT Tokens<br/>Access & Refresh]
    GenerateJWT --> SetCookie[Set HttpOnly Cookies<br/>Access & Refresh Tokens]
    SetCookie --> Response2[Success Response]
    
    API3 --> ValidateToken{"Refresh Token Verification<br>from HttpOnly Cookie"}
    ValidateToken -->|Invalid| Error3[Token Error]
    ValidateToken -->|Valid| GenerateAccess[Generate New Access Token]
    GenerateAccess --> SetCookie2[Update HttpOnly Cookie<br/>New Access Token]
    SetCookie2 --> Response3[Success Response]
    
    Response1 --> Frontend
    Response2 --> Frontend
    Response3 --> Frontend
    Error1 --> Frontend
    Error2 --> Frontend
    Error3 --> Frontend
    Frontend --> End([User])
```

## 6. Data Storage Types

```mermaid
graph TB
    subgraph StructuredData["Structured Data (PostgreSQL)"]
        D1[User]
        D2[Video]
        D3[VideoGroup]
        D4[VideoGroupMember]
        D5[ChatLog]
    end
    
    subgraph VectorData["Vector Data (PGVector)"]
        V1[Scene Vectors]
        V2[Metadata]
    end
    
    subgraph FileStorage["File Storage"]
        F1[Video Files<br/>Local/S3]
        F2[Static Files<br/>Django Static Files]
    end
    
    subgraph Cache["Cache (Redis)"]
        C1[Celery Task Queue]
        C2[Result Backend]
    end
    
    subgraph Temporary["Temporary Data"]
        T1[Processing Audio Files]
        T2[Temporary Video Files]
    end
    
    D2 --> F1
    D2 --> V1
    V1 --> V2
    D5 --> V1
```

## Data Flow Characteristics

### Asynchronous Processing
- Video transcription is processed asynchronously by Celery Worker
- Redis is used as message broker

### Vector Search
- Similarity search using PGVector
- Search related scenes for RAG

### Data Integrity
- Referential integrity through foreign key constraints
- Consistency guarantee through transactions

### Scalability
- File storage supports S3
- Vector search is accelerated with pgvector
