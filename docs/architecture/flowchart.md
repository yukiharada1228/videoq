# Flowchart

## Overview

This flowchart represents the main processing flows of the Ask Video system.

## 1. Video Upload Processing Flow

```mermaid
flowchart TD
    Start([Video Upload Start]) --> Input[User Selects File]
    Input --> Validate1{File Format<br/>Validation}
    Validate1 -->|Invalid| Error1[Error Display<br/>Unsupported Format]
    Validate1 -->|Valid| Validate2{File Size<br/>Check}
    Validate2 -->|Exceeds| Error2[Error Display<br/>Size Exceeded]
    Validate2 -->|OK| Upload[Start File Upload]
    Upload --> SaveDB[(Database<br/>Save Video<br/>status: pending)]
    SaveDB --> Queue[Redis Queue<br/>Add Task]
    Queue --> Response[Success Response]
    Response --> Display[Upload Success Display]
    Display --> Wait[User Waits]
    
    Queue --> Worker[Celery Worker<br/>Receives Task]
    Worker --> UpdateStatus[Update status: processing]
    UpdateStatus --> SaveDB2[(Database Update)]
    SaveDB2 --> CheckFile{File Exists<br/>Check}
    CheckFile -->|Not Exists| Error3[Error Processing]
    CheckFile -->|Exists| Extract[Extract Audio<br/>with ffmpeg]
    Extract --> CheckSize{File Size<br/>24MB or less?}
    CheckSize -->|Yes| Transcribe1[Whisper API<br/>Transcription]
    CheckSize -->|No| Split[Split Audio]
    Split --> Transcribe2[Transcribe Each Segment<br/>in Parallel]
    Transcribe2 --> Merge[Merge Segments]
    Merge --> CreateSRT[Convert to SRT Format]
    Transcribe1 --> CreateSRT
    CreateSRT --> SceneSplit[Scene Splitting Process]
    SceneSplit --> SaveTranscript[(Database<br/>Save transcript)]
    SaveTranscript --> Vectorize[PGVector<br/>Vectorize and Save]
    Vectorize --> UpdateComplete[Update status: completed]
    UpdateComplete --> SaveDB3[(Database<br/>Final Update)]
    SaveDB3 --> Notify[Completion Notification]
    Notify --> End([Processing Complete])
    
    Error1 --> End
    Error2 --> End
    Error3 --> ErrorHandle[Update status: error<br/>Save Error Message]
    ErrorHandle --> End
```

## 2. Chat Processing Flow (RAG)

```mermaid
flowchart TD
    Start([Chat Send]) --> Input[User Inputs Question]
    Input --> Validate1{Input Validation}
    Validate1 -->|Empty| Error1[Error Display]
    Validate1 -->|Valid| Send[Send API Request]
    Send --> Auth{Authentication Check}
    Auth -->|Failed| Error2[Authentication Error]
    Auth -->|Success| CheckAPIKey{System API Key<br/>Configured?}
    CheckAPIKey -->|Not Configured| Error3[API Key Not Configured Error]
    CheckAPIKey -->|Configured| CheckGroup{Group Specified?}
    CheckGroup -->|No| NoContext[No Context]
    CheckGroup -->|Yes| GetGroup[(Database<br/>Get VideoGroup)]
    GetGroup --> ValidateGroup{Group Exists<br/>Check}
    ValidateGroup -->|Not Exists| Error4[Group Not Found Error]
    ValidateGroup -->|Exists| VectorSearch[PGVector<br/>Vector Search]
    VectorSearch --> GetScenes[Get Related Scenes]
    GetScenes --> BuildContext[Build Context]
    BuildContext --> CallLLM[OpenAI LLM<br/>API Call]
    NoContext --> CallLLM
    CallLLM --> CheckResponse{Response<br/>Success?}
    CheckResponse -->|Failed| Error5[LLM Error]
    CheckResponse -->|Success| ParseAnswer[Parse Answer]
    ParseAnswer --> SaveLog[(Database<br/>Save ChatLog)]
    SaveLog --> ReturnAnswer[Return Answer]
    ReturnAnswer --> Display[Display Answer]
    Display --> End([Complete])
    
    Error1 --> End
    Error2 --> End
    Error3 --> End
    Error4 --> End
    Error5 --> End
```

## 3. User Authentication Flow

```mermaid
flowchart TD
    Start([Authentication Start]) --> Select{Select Operation}
    Select -->|Sign Up| Signup[Sign Up]
    Select -->|Login| Login[Login]
    Select -->|Password Reset| Reset[Password Reset]
    
    Signup --> InputSignup[Input User Information]
    InputSignup --> ValidateSignup{Input Validation}
    ValidateSignup -->|Invalid| ErrorSignup[Error Display]
    ValidateSignup -->|Valid| CreateUser[(Database<br/>Create User<br/>is_active: False)]
    CreateUser --> GenerateToken[Generate Verification Token]
    GenerateToken --> SendEmail[Send Verification Email]
    SendEmail --> ShowMessage[Email Confirmation Waiting Screen]
    ShowMessage --> WaitEmail[User Checks Email]
    WaitEmail --> ClickLink[Click Verification Link]
    ClickLink --> VerifyToken{Token Verification}
    VerifyToken -->|Invalid| ErrorToken[Token Invalid Error]
    VerifyToken -->|Valid| ActivateUser[(Database<br/>Update is_active: True)]
    ActivateUser --> RedirectLogin[Redirect to Login Page]
    RedirectLogin --> Login
    
    Login --> InputLogin[Input Login Information]
    InputLogin --> ValidateLogin{Credential Verification}
    ValidateLogin -->|Invalid| ErrorLogin[Authentication Error]
    ValidateLogin -->|Valid| GenerateJWT[Generate JWT Token]
    GenerateJWT --> SetCookie[Set HttpOnly Cookie]
    SetCookie --> RedirectHome[Redirect to Home Page]
    RedirectHome --> End([Authentication Complete])
    
    Reset --> InputEmail[Input Email Address]
    InputEmail --> ValidateEmail{Email Address<br/>Exists Check}
    ValidateEmail -->|Not Exists| ErrorEmail[Error Display]
    ValidateEmail -->|Exists| GenerateResetToken[Generate Reset Token]
    GenerateResetToken --> SendResetEmail[Send Reset Email]
    SendResetEmail --> WaitReset[User Checks Email]
    WaitReset --> ClickResetLink[Click Reset Link]
    ClickResetLink --> VerifyResetToken{Token Verification}
    VerifyResetToken -->|Invalid| ErrorResetToken[Token Invalid]
    VerifyResetToken -->|Valid| InputNewPassword[Input New Password]
    InputNewPassword --> UpdatePassword[(Database<br/>Update Password)]
    UpdatePassword --> RedirectLogin2[Redirect to Login Page]
    RedirectLogin2 --> Login
    
    ErrorSignup --> End
    ErrorToken --> End
    ErrorLogin --> End
    ErrorEmail --> End
    ErrorResetToken --> End
```

## 4. Group Management Flow

```mermaid
flowchart TD
    Start([Group Management]) --> Action{Select Operation}
    Action -->|Create| Create[Create Group]
    Action -->|Edit| Edit[Edit Group]
    Action -->|Delete| Delete[Delete Group]
    Action -->|Add Video| AddVideo[Add Video]
    Action -->|Reorder| Reorder[Reorder]
    
    Create --> InputCreate[Input Group Information]
    InputCreate --> ValidateCreate{Input Validation}
    ValidateCreate -->|Invalid| ErrorCreate[Error Display]
    ValidateCreate -->|Valid| SaveGroup[(Database<br/>Create VideoGroup)]
    SaveGroup --> SuccessCreate[Create Success]
    SuccessCreate --> End([Complete])
    
    Edit --> SelectGroup[Select Group]
    SelectGroup --> InputEdit[Input Edit Information]
    InputEdit --> ValidateEdit{Input Validation}
    ValidateEdit -->|Invalid| ErrorEdit[Error Display]
    ValidateEdit -->|Valid| UpdateGroup[(Database<br/>Update VideoGroup)]
    UpdateGroup --> SuccessEdit[Update Success]
    SuccessEdit --> End
    
    Delete --> SelectGroup2[Select Group]
    SelectGroup2 --> Confirm{Delete Confirmation}
    Confirm -->|Cancel| Cancel[Cancel]
    Confirm -->|Confirm| DeleteGroup[(Database<br/>Delete VideoGroup<br/>CASCADE)]
    DeleteGroup --> SuccessDelete[Delete Success]
    SuccessDelete --> End
    Cancel --> End
    
    AddVideo --> SelectGroup3[Select Group]
    SelectGroup3 --> SelectVideos[Select Videos]
    SelectVideos --> ValidateOwnership{Ownership Verification}
    ValidateOwnership -->|Invalid| ErrorOwnership[Ownership Error]
    ValidateOwnership -->|Valid| CheckDuplicate{Duplicate Check}
    CheckDuplicate -->|Duplicate| Skip[Skip]
    CheckDuplicate -->|New| CreateMember[(Database<br/>Create VideoGroupMember)]
    CreateMember --> SuccessAdd[Add Success]
    SuccessAdd --> End
    Skip --> End
    ErrorOwnership --> End
    
    Reorder --> SelectGroup4[Select Group]
    SelectGroup4 --> InputOrder[Input Order Array]
    InputOrder --> ValidateOrder{Order Validation}
    ValidateOrder -->|Invalid| ErrorOrder[Error Display]
    ValidateOrder -->|Valid| UpdateOrder[(Database<br/>Bulk Update Order)]
    UpdateOrder --> SuccessReorder[Update Success]
    SuccessReorder --> End
    
    ErrorCreate --> End
    ErrorEdit --> End
    ErrorOrder --> End
```

## 5. Sharing Feature Flow

```mermaid
flowchart TD
    Start([Sharing Feature]) --> Action{Select Operation}
    Action -->|Generate Link| Generate[Generate Share Link]
    Action -->|Delete Link| Delete[Delete Share Link]
    Action -->|Share Access| Access[Access Share Link]
    
    Generate --> SelectGroup[Select Group]
    SelectGroup --> ValidateOwner{Ownership Verification}
    ValidateOwner -->|Invalid| ErrorOwner[Ownership Error]
    ValidateOwner -->|Valid| GenerateToken[Generate Share Token]
    GenerateToken --> SaveToken[(Database<br/>Save share_token)]
    SaveToken --> CreateURL[Create Share URL]
    CreateURL --> DisplayURL[Display Share URL]
    DisplayURL --> End([Complete])
    
    Delete --> SelectGroup2[Select Group]
    SelectGroup2 --> ValidateOwner2{Ownership Verification}
    ValidateOwner2 -->|Invalid| ErrorOwner2[Ownership Error]
    ValidateOwner2 -->|Valid| CheckToken{Token Exists<br/>Check}
    CheckToken -->|Not Exists| ErrorNoToken[Token Not Set Error]
    CheckToken -->|Exists| DeleteToken[(Database<br/>Delete share_token)]
    DeleteToken --> SuccessDelete[Delete Success]
    SuccessDelete --> End
    
    Access --> ExtractToken[Extract Token from URL]
    ExtractToken --> ValidateToken{Token Verification}
    ValidateToken -->|Invalid| ErrorToken[Token Invalid Error]
    ValidateToken -->|Valid| GetGroup[(Database<br/>Get VideoGroup)]
    GetGroup --> GetVideos[(Database<br/>Get Related Videos)]
    GetVideos --> DisplayGroup[Display Group Information]
    DisplayGroup --> AllowChat[Chat Feature Available]
    AllowChat --> End
    
    ErrorOwner --> End
    ErrorOwner2 --> End
    ErrorNoToken --> End
    ErrorToken --> End
```

## 6. Error Handling Flow

```mermaid
flowchart TD
    Start([Error Occurred]) --> Catch[Catch Error]
    Catch --> Classify{Error Classification}
    
    Classify -->|Authentication Error| AuthError[401 Unauthorized]
    Classify -->|Permission Error| PermissionError[403 Forbidden]
    Classify -->|Resource Not Found| NotFoundError[404 Not Found]
    Classify -->|Validation Error| ValidationError[400 Bad Request]
    Classify -->|Server Error| ServerError[500 Internal Server Error]
    
    AuthError --> LogError[Log Error]
    PermissionError --> LogError
    NotFoundError --> LogError
    ValidationError --> LogError
    ServerError --> LogError
    
    LogError --> CreateResponse[Generate Error Response]
    CreateResponse --> ReturnError[Return Error Response]
    ReturnError --> DisplayError[Display Error]
    DisplayError --> End([Complete])
    
    ServerError --> NotifyAdmin[Notify Administrator]
    NotifyAdmin --> LogError
```
