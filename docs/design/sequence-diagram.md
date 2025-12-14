# Sequence Diagram

## Overview

This diagram represents the main processing flows of the VideoQ system.

## 1. Video Upload and Transcription Processing

```mermaid
sequenceDiagram
    participant User as User
    participant Frontend as Frontend
    participant Backend as Backend API
    participant DB as Database
    participant Celery as Celery Worker
    participant Whisper as Whisper API
    participant PGVector as PGVector

    User->>Frontend: Upload Video File
    Frontend->>Backend: POST /api/videos/
    Backend->>Backend: Validate request (file, User.video_limit)
    Backend->>DB: Create Video(status: pending)
    DB-->>Backend: Video Saved
    Backend->>Celery: transcribe_video.delay(video_id)
    Backend-->>Frontend: 201 Created
    Frontend-->>User: Upload Success Display
    
    Celery->>DB: Get Video
    DB-->>Celery: Video Information
    Celery->>DB: Update status(processing)
    Celery->>Celery: Extract Audio with ffmpeg
    Celery->>Celery: Get OpenAI API Key (Video Owner)
    alt OpenAI API key not configured
        Celery->>DB: Update status(error) + Save Error Message
    else OpenAI API key configured
        Celery->>Whisper: Send Audio File
        Whisper-->>Celery: Transcription Result
        Celery->>Celery: Convert to SRT Format
        Celery->>Celery: Scene Splitting Process
        Celery->>DB: Save transcript
        Celery->>PGVector: Vectorize and Save
        Celery->>DB: Update status(completed)
    end
    
    User->>Frontend: Reload Video Detail Page
    Frontend->>Backend: GET /api/videos/{id}/
    Backend->>DB: Get Video
    DB-->>Backend: Video Information(including transcript)
    Backend-->>Frontend: Video Details
    Frontend-->>User: Display Transcription Result
```

## 2. Chat Processing (RAG)

```mermaid
sequenceDiagram
    participant User as User
    participant Frontend as Frontend
    participant Backend as Backend API
    participant DB as Database
    participant PGVector as PGVector
    participant OpenAI as OpenAI API

    User->>Frontend: Input Question
    Frontend->>Backend: POST /api/chat/ (body: group_id=123)
    Backend->>Backend: Get OpenAI API Key (User)
    Backend->>DB: Get VideoGroup
    DB-->>Backend: VideoGroup Information
    Backend->>PGVector: Search Related Scenes(Vector Search)
    PGVector-->>Backend: Related Scenes List
    Backend->>Backend: Build Context
    Backend->>OpenAI: Send Chat Request
    OpenAI-->>Backend: LLM Answer
    Backend->>DB: Save ChatLog
    DB-->>Backend: ChatLog Saved
    Backend-->>Frontend: Answer and Related Video Information
    Frontend-->>User: Display Answer
```

## 3. User Authentication Flow

```mermaid
sequenceDiagram
    participant User as User
    participant Frontend as Frontend
    participant Backend as Backend API
    participant DB as Database
    participant Email as Email Server

    User->>Frontend: Input Sign Up Information
    Frontend->>Backend: POST /api/auth/signup/
    Backend->>DB: Create User(is_active: False)
    DB-->>Backend: User Created
    Backend->>Backend: Generate Verification Token
    Backend->>Email: Send Verification Email
    Backend-->>Frontend: 201 Created
    Frontend-->>User: Email Confirmation Waiting Screen
    
    User->>Email: Open Verification Email
    User->>Frontend: Click Verification Link
    Frontend->>Backend: POST /api/auth/verify-email/
    Backend->>Backend: Verify Token
    Backend->>DB: Update is_active(True)
    DB-->>Backend: Update Complete
    Backend-->>Frontend: Verification Success
    Frontend-->>User: Redirect to Login Page
    
    User->>Frontend: Input Login Information
    Frontend->>Backend: POST /api/auth/login/
    Backend->>DB: Verify Credentials
    DB-->>Backend: User Information
    Backend->>Backend: Generate JWT Tokens<br/>(Access & Refresh)
    Backend-->>Frontend: Set HttpOnly Cookies<br/>(Access & Refresh Tokens)
    Frontend-->>User: Redirect to Home Page
```

## 4. Group Sharing Flow

```mermaid
sequenceDiagram
    participant Owner as Owner
    participant Guest as Guest
    participant Frontend as Frontend
    participant Backend as Backend API
    participant DB as Database

    Owner->>Frontend: Generate Share Link
    Frontend->>Backend: POST /api/videos/groups/{id}/share/
    Backend->>DB: Get Group & Verify Ownership
    DB-->>Backend: VideoGroup Information
    Backend->>Backend: Generate Share Token
    Backend->>DB: Save share_token
    DB-->>Backend: Update Complete
    Backend-->>Frontend: Share URL
    Frontend-->>Owner: Display Share URL
    
    Owner->>Guest: Send Share URL
    Guest->>Frontend: Access Share URL(/share/{token})
    Frontend->>Backend: GET /api/videos/groups/shared/{token}/
    Backend->>DB: Search Group by share_token
    DB-->>Backend: VideoGroup Information
    Backend-->>Frontend: Group Information
    Frontend-->>Guest: Display Group Information
    
    Guest->>Frontend: Send Chat
    Frontend->>Backend: POST /api/chat/?share_token={token} (body: group_id={id})
    Backend->>DB: Get VideoGroup by id + share_token
    DB-->>Backend: VideoGroup Information
    Backend->>Backend: Get OpenAI API Key (Group Owner)
    Backend->>Backend: Execute RAG Processing
    Backend->>DB: Save ChatLog(is_shared_origin: True)
    Backend-->>Frontend: Answer
    Frontend-->>Guest: Display Answer
```

## 5. Video Group Management

```mermaid
sequenceDiagram
    participant User as User
    participant Frontend as Frontend
    participant Backend as Backend API
    participant DB as Database

    User->>Frontend: Create Group
    Frontend->>Backend: POST /api/videos/groups/
    Backend->>DB: Create VideoGroup
    DB-->>Backend: VideoGroup Created
    Backend-->>Frontend: Group Information
    Frontend-->>User: Display Group
    
    User->>Frontend: Add Video to Group
    Frontend->>Backend: POST /api/videos/groups/{id}/videos/
    Backend->>DB: Get Group & Video & Verify Ownership
    DB-->>Backend: Resource Information
    Backend->>DB: Create VideoGroupMember(Duplicate Check)
    DB-->>Backend: Created
    Backend-->>Frontend: Add Success
    Frontend-->>User: Display Updated Group
    
    User->>Frontend: Change Video Order
    Frontend->>Backend: PATCH /api/videos/groups/{id}/reorder/
    Backend->>DB: Get Group & Verify Ownership
    DB-->>Backend: VideoGroupMember List
    Backend->>DB: Bulk Update Order(bulk_update)
    DB-->>Backend: Update Complete
    Backend-->>Frontend: Update Success
    Frontend-->>User: Display Updated Order
```

## 6. Password Reset Flow

```mermaid
sequenceDiagram
    participant User as User
    participant Frontend as Frontend
    participant Backend as Backend API
    participant DB as Database
    participant Email as Email Server

    User->>Frontend: Request Password Reset
    Frontend->>Backend: POST /api/auth/password-reset/
    Backend->>DB: Search User(Email Address)
    DB-->>Backend: User Information
    Backend->>Backend: Generate Reset Token
    Backend->>Email: Send Reset Email
    Backend-->>Frontend: Email Sent
    Frontend-->>User: Email Confirmation Waiting Screen
    
    User->>Email: Open Reset Email
    User->>Frontend: Click Reset Link
    Frontend->>Backend: POST /api/auth/password-reset/confirm/
    Backend->>Backend: Verify Token
    Backend->>DB: Update Password
    DB-->>Backend: Update Complete
    Backend-->>Frontend: Reset Success
    Frontend-->>User: Redirect to Login Page
```
