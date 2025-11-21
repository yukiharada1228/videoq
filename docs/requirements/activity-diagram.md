# Activity Diagram

## Overview

This diagram represents the main business flows of the TalkVid system.

## 1. Flow from Video Upload to Transcription Completion

```mermaid
flowchart TD
    Start([User Uploads Video]) --> Upload[Upload Video File]
    Upload --> Validate{File Format<br/>Validation}
    Validate -->|Invalid| Error1[Error Display]
    Validate -->|Valid| Save[Save to Database<br/>status: pending]
    Save --> Queue[Add Celery Task to Queue]
    Queue --> Wait[User Waits]
    
    Queue --> Worker[Celery Worker<br/>Receives Task]
    Worker --> UpdateStatus1[Update status: processing]
    UpdateStatus1 --> Extract[Extract Audio with ffmpeg]
    Extract --> CheckSize{File Size<br/>Check}
    CheckSize -->|24MB or less| Transcribe1[Execute Transcription<br/>with Whisper API]
    CheckSize -->|Over 24MB| Split[Split Audio]
    Split --> Transcribe2[Transcribe Each Segment<br/>in Parallel]
    Transcribe2 --> Merge[Merge Segments]
    Merge --> CreateSRT[Convert to SRT Format]
    Transcribe1 --> CreateSRT
    CreateSRT --> SceneSplit[Scene Splitting Process]
    SceneSplit --> SaveTranscript[Save Transcription Result<br/>to Database]
    SaveTranscript --> Vectorize[Vectorize and Save<br/>to PGVector]
    Vectorize --> UpdateStatus2[Update status: completed]
    UpdateStatus2 --> Notify[Notify User of Completion]
    Notify --> End([Complete])
    
    Error1 --> End
    Worker -->|Error Occurred| UpdateError[Update status: error<br/>Save Error Message]
    UpdateError --> End
```

## 2. Chat Processing Flow (RAG)

```mermaid
flowchart TD
    Start([User Sends Question]) --> Auth{Authentication Check}
    Auth -->|Unauthenticated| Error1[Authentication Error]
    Auth -->|Authenticated| GetGroup{Group Specified?}
    
    GetGroup -->|Yes| ValidateGroup[Validate Group Existence]
    GetGroup -->|No| GetAPIKey[Get System<br/>OpenAI API Key]
    ValidateGroup --> GetAPIKey
    GetAPIKey --> CheckKey{API Key<br/>Configured?}
    CheckKey -->|Not Configured| Error2[API Key Not Configured Error]
    CheckKey -->|Configured| ParseQuery[Parse Question Text]
    ParseQuery --> VectorSearch{Group Specified?}
    
    VectorSearch -->|Yes| SearchVectors[Search Related Scenes<br/>with PGVector]
    VectorSearch -->|No| NoContext[No Context]
    
    SearchVectors --> BuildContext[Build Context from<br/>Related Scenes]
    BuildContext --> CallLLM[Generate Answer<br/>with OpenAI LLM]
    NoContext --> CallLLM
    
    CallLLM --> SaveLog[Save Chat Log<br/>to Database]
    SaveLog --> ReturnAnswer[Return Answer]
    ReturnAnswer --> End([Complete])
    
    Error1 --> End
    Error2 --> End
    CallLLM -->|Error| Error3[Error Response]
    Error3 --> End
```

## 3. User Registration Flow

```mermaid
flowchart TD
    Start([User Signs Up]) --> Input[Input User Information]
    Input --> Validate{Input Validation}
    Validate -->|Invalid| ShowError[Error Display]
    Validate -->|Valid| CreateUser[Create User<br/>is_active: False]
    CreateUser --> GenerateToken[Generate Verification Token]
    GenerateToken --> SendEmail[Send Verification Email]
    SendEmail --> ShowMessage[Display Email Confirmation Waiting Screen]
    ShowMessage --> Wait[User Checks Email]
    
    Wait --> ClickLink[Click Verification Link]
    ClickLink --> VerifyToken{Token Verification}
    VerifyToken -->|Invalid| Error1[Error Message]
    VerifyToken -->|Valid| ActivateUser[Update is_active: True]
    ActivateUser --> Success[Registration Complete]
    Success --> Redirect[Redirect to Login Page]
    Redirect --> End([Complete])
    
    ShowError --> Input
    Error1 --> End
```

## 4. Group Sharing Flow

```mermaid
flowchart TD
    Start([User Generates Share Link]) --> CheckAuth{Authentication Check}
    CheckAuth -->|Unauthenticated| Error1[Authentication Error]
    CheckAuth -->|Authenticated| GetGroup[Get Group]
    GetGroup --> ValidateOwner{Owner Verification}
    ValidateOwner -->|Mismatch| Error2[Permission Error]
    ValidateOwner -->|Match| GenerateToken[Generate Share Token]
    GenerateToken --> SaveToken[Save to Database]
    SaveToken --> ReturnURL[Return Share URL]
    ReturnURL --> End([Complete])
    
    Error1 --> End
    Error2 --> End
    
    subgraph ShareAccess[Share Link Access]
        Guest([Guest Accesses Share Link]) --> ExtractToken[Extract Token]
        ExtractToken --> ValidateToken{Token Verification}
        ValidateToken -->|Invalid| Error3[Link Invalid]
        ValidateToken -->|Valid| GetSharedGroup[Get Shared Group]
        GetSharedGroup --> ShowGroup[Display Group Information]
        ShowGroup --> AllowChat[Chat Function Available]
        AllowChat --> End2([Complete])
        Error3 --> End2
    end
```

## 5. Video Group Management Flow

```mermaid
flowchart TD
    Start([User Creates Group]) --> CreateGroup[Create Group]
    CreateGroup --> AddVideos[Add Videos]
    AddVideos --> ValidateVideos{Video Ownership<br/>Verification}
    ValidateVideos -->|Invalid| Error1[Error Display]
    ValidateVideos -->|Valid| CheckDuplicate{Already Added?}
    CheckDuplicate -->|Yes| Skip[Skip]
    CheckDuplicate -->|No| CreateMember[Create VideoGroupMember]
    CreateMember --> SetOrder[Set Order]
    SetOrder --> Save[Save to Database]
    Save --> Success[Success]
    Success --> End([Complete])
    
    Skip --> Success
    Error1 --> End
    
    subgraph Reorder[Reorder]
        ReorderStart([Reorder Request]) --> GetVideos[Get Videos in Group]
        GetVideos --> ValidateOrder{Order Array<br/>Validation}
        ValidateOrder -->|Invalid| Error2[Error]
        ValidateOrder -->|Valid| UpdateOrder[Bulk Update]
        UpdateOrder --> ReorderEnd([Complete])
        Error2 --> ReorderEnd
    end
```
