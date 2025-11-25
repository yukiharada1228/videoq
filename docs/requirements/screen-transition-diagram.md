# Screen Transition Diagram

## Overview

This diagram represents the frontend screen transitions of the VideoQ application.

## Screen Transition Diagram

```mermaid
stateDiagram-v2
    [*] --> Home: Initial Access
    
    Home --> Login: Login Button
    Home --> Signup: Sign Up Button
    
    Login --> Home: Login Success
    Login --> ForgotPassword: Forgot Password
    Login --> Signup: Sign Up Link
    
    Signup --> CheckEmail: Sign Up Success
    CheckEmail --> VerifyEmail: Email Verification Link
    VerifyEmail --> Login: Verification Success
    
    ForgotPassword --> ResetPassword: Reset Email Sent
    ResetPassword --> Login: Password Reset Success
    
    Home --> VideoList: Logged In
    VideoList --> VideoDetail: Select Video
    VideoList --> VideoGroupList: Group List
    VideoList --> Settings: Settings
    
    VideoDetail --> VideoList: Back
    VideoDetail --> VideoGroupDetail: Select Group
    
    VideoGroupList --> VideoGroupDetail: Select Group
    VideoGroupList --> VideoList: Back
    
    VideoGroupDetail --> VideoGroupList: Back
    VideoGroupDetail --> VideoDetail: Select Video
    VideoGroupDetail --> SharePage: Generate Share Link
    
    SharePage --> VideoGroupDetail: Back
    
    Settings --> VideoList: Back
    
    Home --> SharePage: Share Token URL
    SharePage --> SharePage: Chat with Shared Group
    
    note right of Home
        Home Page
        - Unauthenticated: Login/Sign Up
        - Authenticated: Go to Video List
    end note
    
    note right of VideoList
        Video List Page
        - Video list display
        - Upload functionality
        - Search & Filter
    end note
    
    note right of VideoDetail
        Video Detail Page
        - Video information display
        - Transcript display
        - Add to group
    end note
    
    note right of VideoGroupDetail
        Group Detail Page
        - Group video list
        - Chat functionality
        - Share link management
    end note
```

## Screen List

### Authentication Related
- **Home** (`/`): Home page
- **Login** (`/login`): Login page
- **Signup** (`/signup`): Sign up page
- **CheckEmail** (`/signup/check-email`): Email confirmation waiting page
- **VerifyEmail** (`/verify-email`): Email verification page
- **ForgotPassword** (`/forgot-password`): Password reset request page
- **ResetPassword** (`/reset-password`): Password reset page

### Video Management
- **VideoList** (`/videos`): Video list page
- **VideoDetail** (`/videos/[id]`): Video detail page

### Group Management
- **VideoGroupList** (`/videos/groups`): Group list page
- **VideoGroupDetail** (`/videos/groups/[id]`): Group detail page

### Sharing
- **SharePage** (`/share/[token]`): Share page (no authentication required)

### Settings
- **Settings** (`/settings`): Settings page

## Transition Conditions

### Transitions Based on Authentication Status
- **Unauthenticated User**: Home → Login/Signup → After authentication → VideoList
- **Authenticated User**: Home → VideoList (direct transition)

### Transitions via Share Links
- **Share Token URL**: Direct access to SharePage (no authentication required)

### Error Handling
- Authentication Error: Any page → Login
- 404 Error: Non-existent resource → Appropriate error page
- Permission Error: Inaccessible resource → Error message display
