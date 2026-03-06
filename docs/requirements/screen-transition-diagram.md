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
    
    VideoDetail --> VideoList: Back
    VideoDetail --> VideoGroupDetail: Select Group
    
    VideoGroupList --> VideoGroupDetail: Select Group
    VideoGroupList --> VideoList: Back
    
    VideoGroupDetail --> VideoGroupList: Back
    VideoGroupDetail --> VideoDetail: Select Video
    VideoGroupDetail --> SharePage: Generate Share Link

    VideoGroupDetail --> VideoGroupDetail: Open Analytics Dashboard
    VideoGroupDetail --> VideoGroupDetail: Open Shorts Player
    
    SharePage --> VideoGroupDetail: Back

    Home --> SharePage: Share Token URL
    SharePage --> SharePage: Chat with Shared Group
    SharePage --> SharePage: Open Shorts Player

    VideoList --> Settings: Settings Menu
    Settings --> VideoList: Back
    
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
        - Tag filtering
    end note
    
    note right of VideoDetail
        Video Detail Page
        - Video information display
        - Transcript display
        - Add to group
        - Tag management
    end note
    
    note right of VideoGroupDetail
        Group Detail Page
        - Group video list
        - Chat functionality
        - Share link management
        - Analytics dashboard
        - Shorts player
    end note

    note right of Settings
        Settings Page
        - User info display
        - Account deactivation
        - API key management
    end note
```

## Screen List

### Authentication Related
- **Home** (`/` or `/:locale`): Home page (e.g., `/`, `/en`, `/ja`)
- **Login** (`/login` or `/:locale/login`): Login page
- **Signup** (`/signup` or `/:locale/signup`): Sign up page
- **CheckEmail** (`/signup/check-email` or `/:locale/signup/check-email`): Email confirmation waiting page
- **VerifyEmail** (`/verify-email` or `/:locale/verify-email`): Email verification page
- **ForgotPassword** (`/forgot-password` or `/:locale/forgot-password`): Password reset request page
- **ResetPassword** (`/reset-password` or `/:locale/reset-password`): Password reset page

### Video Management
- **VideoList** (`/videos` or `/:locale/videos`): Video list page
- **VideoDetail** (`/videos/:id` or `/:locale/videos/:id`): Video detail page

### Group Management
- **VideoGroupList** (`/videos/groups` or `/:locale/videos/groups`): Group list page
- **VideoGroupDetail** (`/videos/groups/:id` or `/:locale/videos/groups/:id`): Group detail page

### Sharing
- **SharePage** (`/share/:token` or `/:locale/share/:token`): Share page (no authentication required)

### Settings
- **Settings** (`/settings` or `/:locale/settings`): Settings page (account info, deactivation, API key management)

**Note**: This project implements locale-aware routing with React Router + react-i18next (not Next.js / next-intl) (`frontend/src/App.tsx`).
- The default locale (`en`) has no prefix: `/videos`
- Other locales use the `/:locale` prefix: `/ja/videos`
- If `/:locale` is missing and the user's preferred locale is not the default, the app automatically redirects to `/:locale/...`

## Transition Conditions

### Transitions Based on Authentication Status
- **Unauthenticated User**: Home → Login/Signup → After authentication → VideoList
- **Authenticated User**: Home → VideoList (direct transition)

### Transitions via Share Links
- **Share Token URL**: Direct access to SharePage (no authentication required)

### Transitions via API Key
- **API Client**: No screen transitions — API keys are used for server-to-server integrations, not browser-based access

### Error Handling
- Authentication Error: Any page → Login
- 404 Error: Non-existent resource → Appropriate error page
- Permission Error: Inaccessible resource → Error message display

## In-Page Interactions (No Route Change)

The following interactions happen within a page (modals, panels, drawers) without navigating to a new route:

### VideoGroupDetail
- **Analytics Dashboard**: Opens as a modal/panel within the group detail page
- **Shorts Player**: Opens as a full-screen overlay from the group detail page
- **Chat Panel**: Inline panel for chatting with the group's videos

### VideoDetail
- **Tag Management**: Tag selector and create dialog are inline modals
- **Add to Group**: Modal to add the video to a group

### VideoList
- **Video Upload**: Modal for uploading a new video
- **Tag Filter Panel**: Inline panel for filtering by tags

### Settings
- **API Key Creation**: Form within the settings page for creating new API keys
- **API Key Revocation**: Confirmation dialog within the settings page
- **Account Deactivation**: Form and confirmation dialog within the settings page
