# State Diagram

## Overview

This diagram represents the state transitions of the main objects in the VideoQ system.

## Video State Transition

```mermaid
stateDiagram-v2
    [*] --> Pending: Video Upload
    
    Pending --> Processing: Celery Task Starts
    Processing --> Completed: Transcription Success
    Processing --> Error: Transcription Failure
    
    Completed --> Processing: Reprocess(Manual)
    Error --> Processing: Reprocess(Manual)
    
    Completed --> [*]: Video Deleted
    Error --> [*]: Video Deleted
    Pending --> [*]: Video Deleted
    
    note right of Pending
        Initial State
        - Upload Complete
        - Waiting for Transcription
    end note
    
    note right of Processing
        Processing
        - Extracting Audio
        - Running Whisper API
        - Vectorizing
    end note
    
    note right of Completed
        Completed
        - Transcription Success
        - Vectorization Complete
        - Chat Available
    end note
    
    note right of Error
        Error
        - Processing Failed
        - Error Message Saved
        - Reprocess Possible
    end note
```

## User State Transition

```mermaid
stateDiagram-v2
    [*] --> Unregistered: Not Registered
    
    Unregistered --> Registered: Sign Up
    Registered --> Inactive: Email Not Verified
    Inactive --> Active: Email Verification Complete
    Active --> Active: Login
    Active --> LoggedOut: Logout
    LoggedOut --> Active: Login
    
    Active --> [*]: Account Deleted
    Inactive --> [*]: Account Deleted
    
    note right of Unregistered
        Unregistered
        - Not Registered in System
    end note
    
    note right of Inactive
        Inactive
        - Signed Up
        - Waiting for Email Verification
        - Cannot Login
    end note
    
    note right of Active
        Active
        - Email Verified
        - Can Login
        - All Features Available
    end note
    
    note right of LoggedOut
        Logged Out
        - Session Terminated
        - Can Login Again
    end note
```

## Video Group Sharing State Transition

```mermaid
stateDiagram-v2
    [*] --> Private: Group Created
    
    Private --> Shared: Generate Share Link
    Shared --> Private: Delete Share Link
    Shared --> Shared: Regenerate Share Link
    
    Private --> [*]: Group Deleted
    Shared --> [*]: Group Deleted
    
    note right of Private
        Private
        - Only Owner Can Access
        - No Share Link
    end note
    
    note right of Shared
        Shared
        - Share Token Exists
        - Guest Access Available
        - Chat Available
    end note
```

## Chat Log Feedback State Transition

```mermaid
stateDiagram-v2
    [*] --> NoFeedback: Chat Log Created
    
    NoFeedback --> Good: Send Feedback(good)
    NoFeedback --> Bad: Send Feedback(bad)
    NoFeedback --> NoFeedback: No Feedback Sent
    
    Good --> Bad: Change Feedback
    Bad --> Good: Change Feedback
    Good --> NoFeedback: Delete Feedback
    Bad --> NoFeedback: Delete Feedback
    
    note right of NoFeedback
        No Feedback
        - Initial State
        - Feedback Not Sent
    end note
    
    note right of Good
        Good Rating
        - User Rated as Good
        - Answer Quality Indicator
    end note
    
    note right of Bad
        Bad Rating
        - User Rated as Bad
        - Improvement Indicator
    end note
```

## Authentication Token State Transition

```mermaid
stateDiagram-v2
    [*] --> Valid: Token Issued
    
    Valid --> Expired: Expired
    Valid --> Refreshed: Refresh
    Refreshed --> Valid: New Token Issued
    Expired --> Valid: Update with Refresh Token
    
    Valid --> [*]: Logout
    Expired --> [*]: Logout
    Refreshed --> [*]: Logout
    
    note right of Valid
        Valid
        - Access Token Valid
        - API Calls Possible
        - Expiration: 10 minutes
    end note
    
    note right of Expired
        Expired
        - Access Token Invalid
        - Refresh Required
    end note
    
    note right of Refreshed
        Refreshing
        - Using Refresh Token
        - Waiting for New Token
    end note
```
