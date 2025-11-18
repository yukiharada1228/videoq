# BPMN Diagram

## Overview

This diagram represents the business processes of the Ask Video system using BPMN (Business Process Model and Notation).

## 1. User Registration Process

```mermaid
flowchart TD
    Start([Start]) --> UserInput[Input User Information]
    UserInput --> Validate{Input Validation}
    Validate -->|Invalid| ShowError[Error Display]
    ShowError --> UserInput
    Validate -->|Valid| CreateAccount[Create Account]
    CreateAccount --> SendEmail[Send Verification Email]
    SendEmail --> WaitEmail{User Checks<br/>Email}
    WaitEmail -->|Not Checked| Timeout{Timeout}
    Timeout -->|Timeout| Expire[Token Expired]
    Expire --> Resend[Resend Possible]
    Resend --> SendEmail
    Timeout -->|Continue Waiting| WaitEmail
    WaitEmail -->|Checked| ClickLink[Click Verification Link]
    ClickLink --> VerifyToken{Token Verification}
    VerifyToken -->|Invalid| InvalidToken[Token Invalid]
    InvalidToken --> Resend
    VerifyToken -->|Valid| ActivateAccount[Activate Account]
    ActivateAccount --> Complete([Registration Complete])
```

## 2. Video Upload & Transcription Process

```mermaid
flowchart TD
    Start([Start]) --> Upload[Upload Video File]
    Upload --> ValidateFile{File Validation}
    ValidateFile -->|Invalid| Reject[Reject Upload]
    Reject --> ShowError[Error Display]
    ShowError --> End([End])
    ValidateFile -->|Valid| SaveFile[Save File]
    SaveFile --> CreateRecord[Create Database Record]
    CreateRecord --> QueueTask[Add to Task Queue]
    QueueTask --> NotifyUser[Notify User]
    NotifyUser --> ProcessTask[Start Background Processing]
    
    ProcessTask --> ExtractAudio[Extract Audio]
    ExtractAudio --> Transcribe[Execute Transcription]
    Transcribe --> CheckResult{Processing Result}
    CheckResult -->|Success| CreateTranscript[Save Transcription]
    CheckResult -->|Failure| HandleError[Error Processing]
    HandleError --> UpdateErrorStatus[Update Error Status]
    UpdateErrorStatus --> NotifyError[Error Notification]
    NotifyError --> End
    
    CreateTranscript --> Vectorize[Vectorization Process]
    Vectorize --> SaveVector[Save Vector Data]
    SaveVector --> UpdateStatus[Update Completion Status]
    UpdateStatus --> NotifyComplete[Completion Notification]
    NotifyComplete --> End
```

## 3. Chat Question & Answer Process

```mermaid
flowchart TD
    Start([Start]) --> InputQuestion[Input Question]
    InputQuestion --> ValidateQuestion{Question Validation}
    ValidateQuestion -->|Invalid| ShowError[Error Display]
    ShowError --> InputQuestion
    ValidateQuestion -->|Valid| CheckAuth{Authentication Check}
    CheckAuth -->|Unauthenticated| RequireAuth[Require Authentication]
    RequireAuth --> End([End])
    CheckAuth -->|Authenticated| CheckAPIKey{API Key<br/>Setting Check}
    CheckAPIKey -->|Not Set| RequireAPIKey[Require API Key Setting]
    RequireAPIKey --> End
    CheckAPIKey -->|Set| CheckGroup{Group Specified}
    
    CheckGroup -->|Specified| GetGroup[Get Group]
    GetGroup --> SearchVector[Vector Search]
    SearchVector --> GetContext[Get Context]
    GetContext --> BuildPrompt[Build Prompt]
    
    CheckGroup -->|Not Specified| BuildPrompt2[Build Prompt<br/>No Context]
    
    BuildPrompt --> CallLLM[LLM API Call]
    BuildPrompt2 --> CallLLM
    CallLLM --> CheckResponse{Response Check}
    CheckResponse -->|Error| HandleLLMError[LLM Error Processing]
    HandleLLMError --> ShowError2[Error Display]
    ShowError2 --> End
    CheckResponse -->|Success| ParseAnswer[Parse Answer]
    ParseAnswer --> SaveLog[Save Chat Log]
    SaveLog --> DisplayAnswer[Display Answer]
    DisplayAnswer --> WaitFeedback{Wait for Feedback}
    WaitFeedback -->|Feedback Exists| SaveFeedback[Save Feedback]
    WaitFeedback -->|No Feedback| Complete
    SaveFeedback --> Complete([Complete])
```

## 4. Group Sharing Process

```mermaid
flowchart TD
    Start([Start]) --> OwnerAction{Owner Operation}
    OwnerAction -->|Generate Link| GenerateLink[Generate Share Link]
    OwnerAction -->|Delete Link| DeleteLink[Delete Share Link]
    
    GenerateLink --> ValidateOwner{Ownership Verification}
    ValidateOwner -->|Invalid| RejectOwner[Permission Error]
    RejectOwner --> End([End])
    ValidateOwner -->|Valid| CreateToken[Generate Token]
    CreateToken --> SaveToken[Save Token]
    SaveToken --> CreateURL[Create Share URL]
    CreateURL --> ShareURL[Share URL]
    ShareURL --> GuestAccess[Wait for Guest Access]
    
    GuestAccess --> AccessLink[Access Share Link]
    AccessLink --> ValidateToken{Token Verification}
    ValidateToken -->|Invalid| InvalidLink[Link Invalid]
    InvalidLink --> End
    ValidateToken -->|Valid| GetSharedGroup[Get Shared Group]
    GetSharedGroup --> DisplayGroup[Display Group Information]
    DisplayGroup --> AllowChat[Allow Chat Usage]
    AllowChat --> ChatProcess[Execute Chat Process]
    ChatProcess --> Complete([Complete])
    
    DeleteLink --> ValidateOwner2{Ownership Verification}
    ValidateOwner2 -->|Invalid| RejectOwner2[Permission Error]
    RejectOwner2 --> End
    ValidateOwner2 -->|Valid| RemoveToken[Remove Token]
    RemoveToken --> InvalidateLink[Invalidate Link]
    InvalidateLink --> Complete
```

## 5. Video Group Management Process

```mermaid
flowchart TD
    Start([Start]) --> SelectAction{Select Operation}
    SelectAction -->|Create| CreateGroup[Create Group]
    SelectAction -->|Edit| EditGroup[Edit Group]
    SelectAction -->|Delete| DeleteGroup[Delete Group]
    SelectAction -->|Add Video| AddVideo[Add Video]
    SelectAction -->|Reorder| ReorderVideo[Reorder]
    
    CreateGroup --> InputInfo[Input Group Information]
    InputInfo --> ValidateInfo{Input Validation}
    ValidateInfo -->|Invalid| ShowError[Error Display]
    ShowError --> InputInfo
    ValidateInfo -->|Valid| SaveGroup[Save Group]
    SaveGroup --> Complete([Complete])
    
    EditGroup --> SelectGroup[Select Group]
    SelectGroup --> InputEdit[Input Edit Information]
    InputEdit --> ValidateEdit{Input Validation}
    ValidateEdit -->|Invalid| ShowError2[Error Display]
    ShowError2 --> InputEdit
    ValidateEdit -->|Valid| UpdateGroup[Update Group]
    UpdateGroup --> Complete
    
    DeleteGroup --> SelectGroup2[Select Group]
    SelectGroup2 --> ConfirmDelete{Delete Confirmation}
    ConfirmDelete -->|Cancel| Cancel[Cancel]
    Cancel --> Complete
    ConfirmDelete -->|Confirm| ExecuteDelete[Execute Group Deletion]
    ExecuteDelete --> CascadeDelete[Delete Related Data<br/>CASCADE]
    CascadeDelete --> Complete
    
    AddVideo --> SelectGroup3[Select Group]
    SelectGroup3 --> SelectVideos[Select Videos]
    SelectVideos --> ValidateOwnership{Ownership Verification}
    ValidateOwnership -->|Invalid| RejectVideo[Ownership Error]
    RejectVideo --> Complete
    ValidateOwnership -->|Valid| CheckDuplicate{Duplicate Check}
    CheckDuplicate -->|Duplicate| SkipVideo[Skip]
    CheckDuplicate -->|New| AddMember[Add Member]
    AddMember --> Complete
    SkipVideo --> Complete
    
    ReorderVideo --> SelectGroup4[Select Group]
    SelectGroup4 --> InputOrder[Input Order]
    InputOrder --> ValidateOrder{Order Validation}
    ValidateOrder -->|Invalid| ShowError3[Error Display]
    ShowError3 --> InputOrder
    ValidateOrder -->|Valid| UpdateOrder[Update Order]
    UpdateOrder --> Complete
```

## 6. Password Reset Process

```mermaid
flowchart TD
    Start([Start]) --> RequestReset[Request Password Reset]
    RequestReset --> InputEmail[Input Email Address]
    InputEmail --> ValidateEmail{Email Address<br/>Existence Check}
    ValidateEmail -->|Not Exists| ShowError[Error Display<br/>For Security, Show Success<br/>Even if Not Exists]
    ValidateEmail -->|Exists| GenerateToken[Generate Reset Token]
    GenerateToken --> SendEmail[Send Reset Email]
    SendEmail --> ShowMessage[Email Sent Message]
    ShowMessage --> WaitEmail{User Checks<br/>Email}
    WaitEmail -->|Not Checked| Timeout{Timeout}
    Timeout -->|Timeout| Expire[Token Expired]
    Expire --> Resend[Resend Possible]
    Resend --> SendEmail
    Timeout -->|Continue Waiting| WaitEmail
    WaitEmail -->|Checked| ClickLink[Click Reset Link]
    ClickLink --> VerifyToken{Token Verification}
    VerifyToken -->|Invalid| InvalidToken[Token Invalid]
    InvalidToken --> Resend
    VerifyToken -->|Valid| InputPassword[Input New Password]
    InputPassword --> ValidatePassword{Password Validation}
    ValidatePassword -->|Invalid| ShowError2[Error Display]
    ShowError2 --> InputPassword
    ValidatePassword -->|Valid| UpdatePassword[Update Password]
    UpdatePassword --> InvalidateToken[Invalidate Token]
    InvalidateToken --> Complete([Complete])
    ShowError --> Complete
```

## 7. Video Deletion Process

```mermaid
flowchart TD
    Start([Start]) --> SelectVideo[Select Video]
    SelectVideo --> ConfirmDelete{Delete Confirmation}
    ConfirmDelete -->|Cancel| Cancel[Cancel]
    Cancel --> End([End])
    ConfirmDelete -->|Confirm| ValidateOwnership{Ownership Verification}
    ValidateOwnership -->|Invalid| Reject[Permission Error]
    Reject --> End
    ValidateOwnership -->|Valid| DeleteFile[Delete File]
    DeleteFile --> DeleteVectors[Delete Vector Data]
    DeleteVectors --> DeleteMemberships[Delete Group Memberships]
    DeleteMemberships --> DeleteRecord[Delete Database Record]
    DeleteRecord --> Complete([Deletion Complete])
```

## Process Characteristics

### Asynchronous Processing
- Video transcription is processed asynchronously in the background
- Task queue management by Celery Worker

### Error Handling
- Appropriate error handling in each process
- User-friendly error messages

### Security
- Authentication and authorization checks in each process
- Secure token-based authentication

### Data Integrity
- Transaction management
- Referential integrity guarantee through CASCADE deletion
