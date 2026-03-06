# Class Diagram

## Overview

This diagram shows the backend models and frontend components of the VideoQ system.

## Backend Models (Django)

```mermaid
classDiagram
    class User {
        +int id
        +string username
        +string email
        +datetime date_joined
        +bool is_active
        +bool is_staff
        +bool is_superuser
        +int video_limit (nullable)
        +datetime deactivated_at (nullable)
    }
    
    class Video {
        +int id
        +ForeignKey user
        +FileField file
        +string title
        +string description
        +datetime uploaded_at
        +string transcript
        +string status
        +string error_message
        +__str__()
    }
    
    class VideoGroup {
        +int id
        +ForeignKey user
        +string name
        +string description
        +datetime created_at
        +datetime updated_at
        +string share_token
        +ManyToManyField videos
        +__str__()
    }
    
    class VideoGroupMember {
        +int id
        +ForeignKey group
        +ForeignKey video
        +datetime added_at
        +int order
        +__str__()
    }
    
    class ChatLog {
        +int id
        +ForeignKey user
        +ForeignKey group
        +string question
        +string answer
        +JSONField related_videos
        +bool is_shared_origin
        +string feedback
        +datetime created_at
    }

    Note: ChatLog.feedback uses FeedbackChoices (good/bad)

    class Tag {
        +int id
        +ForeignKey user
        +string name
        +string color
        +datetime created_at
        +__str__()
    }

    class VideoTag {
        +int id
        +ForeignKey video
        +ForeignKey tag
        +datetime added_at
        +__str__()
    }
    
    class SafeFilenameMixin {
        +get_available_name()
        +_get_safe_filename()
    }
    
    class SafeFileSystemStorage {
        +get_available_name()
    }
    
    class SafeS3Boto3Storage {
        +_normalize_name()
        +get_available_name()
    }
    
    User "1" --> "*" Video : owns
    User "1" --> "*" VideoGroup : owns
    User "1" --> "*" ChatLog : creates
    User "1" --> "*" Tag : owns
    VideoGroup "1" --> "*" VideoGroupMember : contains
    Video "1" --> "*" VideoGroupMember : belongs_to
    Video "1" --> "*" VideoTag : has
    Tag "1" --> "*" VideoTag : used_in
    VideoGroup "1" --> "*" ChatLog : has
    SafeFileSystemStorage --|> SafeFilenameMixin : extends
    SafeS3Boto3Storage --|> SafeFilenameMixin : extends
    Video --> SafeFileSystemStorage : uses (local)
    Video --> SafeS3Boto3Storage : uses (S3)
    
    class QueryOptimizer {
        +optimize_video_queryset()
        +optimize_video_group_queryset()
        +get_videos_with_metadata()
        +get_video_groups_with_videos()
    }
    
    class ValidationHelper {
        +validate_required_fields()
        +validate_field_length()
        +validate_email_format()
    }
    
    class ErrorHandler {
        +handle_task_error()
        +validate_required_fields()
        +safe_execute()
    }
    
    QueryOptimizer --> Video : optimizes
    QueryOptimizer --> VideoGroup : optimizes
    ErrorHandler --> ValidationHelper : uses
```

## Frontend Components (React/TypeScript)

```mermaid
classDiagram
    class PageLayout {
        +ReactNode children
        +ReactNode headerContent
        +bool centered
        +bool fullWidth
        +render()
    }
    
    class Header {
        +ReactNode children
        +useAuth()
        +handleLogout()
        +render()
    }
    
    class Footer {
        +render()
    }
    
    class AuthForm {
        +string title
        +string description
        +FormFieldConfig[] fields
        +object formData
        +string error
        +bool loading
        +string submitButtonText
        +function onSubmit
        +function onFieldChange
        +render()
    }
    
    class FormField {
        +string name
        +string type
        +string label
        +string value
        +string error
        +function onChange
        +render()
    }
    
    class VideoList {
        +Video[] videos
        +bool loading
        +string error
        +function onVideoSelect
        +render()
    }
    
    class VideoCard {
        +Video video
        +function onClick
        +render()
    }
    
    class VideoUpload {
        +function onUploadSuccess
        +handleUpload()
        +render()
    }
    
    class ChatPanel {
        +int groupId
        +function onVideoPlay
        +string shareToken
        +string className
        +handleSend()
        +render()
    }

    class TagBadge {
        +Tag tag
        +bool showRemove
        +function onRemove
        +render()
    }

    class TagSelector {
        +Tag[] selectedTags
        +function onTagsChange
        +render()
    }

    class TagCreateDialog {
        +bool open
        +function onOpenChange
        +function onTagCreated
        +render()
    }

    class TagFilterPanel {
        +Tag[] selectedTags
        +function onFilterChange
        +render()
    }

    class ShortsButton {
        +int groupId
        +string shareToken
        +render()
    }

    class ShortsPlayer {
        +Scene[] scenes
        +function onClose
        +render()
    }
    
    class LoadingState {
        +bool isLoading
        +string error
        +ReactNode children
        +string loadingMessage
        +string errorMessage
        +bool fullScreen
        +render()
    }
    
    class I18nProvider {
        +ReactNode children
        +initI18n()
        +render()
    }
    
    class QueryProvider {
        +ReactNode children
        +render()
    }
    
    PageLayout "1" --> "1" Header : contains
    PageLayout "1" --> "1" Footer : contains
    AuthForm "1" --> "*" FormField : contains
    VideoList "1" --> "*" VideoCard : contains
    ChatPanel --> LoadingState : uses
    I18nProvider --> PageLayout : wraps
    QueryProvider --> I18nProvider : wraps
```

## Backend Use Cases & Views (Clean Architecture)

### Use Case Interfaces

```mermaid
classDiagram
    class CreateVideoUseCase {
        +execute(user_id, video_limit, validated_data) VideoOutputDTO
    }
    class GetVideoUseCase {
        +execute(video_id, user_id) VideoOutputDTO
    }
    class ListVideosUseCase {
        +execute(user_id, filters) list~VideoOutputDTO~
    }
    class UpdateVideoUseCase {
        +execute(video_id, user_id, data) VideoOutputDTO
    }
    class GetGroupUseCase {
        +execute(group_id, user_id) GroupOutputDTO
    }
    class GetTagUseCase {
        +execute(user_id) list~TagOutputDTO~
    }
    class SendMessageUseCase {
        +execute(user_id, messages, group_id, locale) ChatOutputDTO
    }
    class LoginUseCase {
        +execute(username, password) TokenPairDto
    }
    class SignupUserUseCase {
        +execute(validated_data) UserEntity
    }
    class GetCurrentUserUseCase {
        +execute(user_id) UserEntity
    }
    class AccountDeletionUseCase {
        +execute(user_id, reason) None
    }
    class ResolveProtectedMediaUseCase {
        +execute(path, user) str
    }
    class RunTranscriptionUseCase {
        +execute(video_id) None
    }
    class ReindexAllVideosUseCase {
        +execute() None
    }
```

### Presentation Views (thin — delegate to use cases via container)

```mermaid
classDiagram
    class VideoListView {
        +get() list response
        +post() created response
    }
    class VideoDetailView {
        +get() detail response
        +patch() updated response
        +delete() success response
    }
    class VideoGroupListView {
        +get() list response
        +post() created response
    }
    class VideoGroupDetailView {
        +get() detail response
        +patch() updated response
        +delete() success response
    }
    class ChatView {
        +post() answer response
    }
    class ChatHistoryView {
        +get() history list response
    }
    class LoginView {
        +post() sets JWT cookies
    }
    class RefreshView {
        +post() refreshes JWT cookies
    }
    class UserSignupView {
        +post() created response
    }
    class AccountDeleteView {
        +delete() deactivates account, clears cookies
    }
    class CurrentUserView {
        +get() user detail response
    }
    class ProtectedMediaView {
        +get() redirects to signed media URL
    }

    VideoListView ..> CreateVideoUseCase : delegates
    VideoListView ..> ListVideosUseCase : delegates
    VideoDetailView ..> GetVideoUseCase : delegates
    VideoDetailView ..> UpdateVideoUseCase : delegates
    ChatView ..> SendMessageUseCase : delegates
    LoginView ..> LoginUseCase : delegates
    AccountDeleteView ..> AccountDeletionUseCase : delegates
    CurrentUserView ..> GetCurrentUserUseCase : delegates
    ProtectedMediaView ..> ResolveProtectedMediaUseCase : delegates
```

## Key Relationships

### Backend
- **User** owns multiple **Video** instances
- **User** owns multiple **VideoGroup** instances
- **VideoGroup** relates to multiple **Video** instances through **VideoGroupMember**
- **ChatLog** is associated with **User** and **VideoGroup**
- **Video** uses **SafeFileSystemStorage** or **SafeS3Boto3Storage**
- **Presentation views** delegate to **Use Cases** via `get_container()` (never import infrastructure directly)
- **Use Cases** depend only on **Domain** abstractions (ABCs / ports)
- **Infrastructure** implements **Domain** ports (repositories, gateways)

### Frontend
- **PageLayout** contains **Header** and **Footer**
- **AuthForm** contains multiple **FormField** instances
- **VideoList** contains multiple **VideoCard** instances
- **I18nProvider** wraps the entire application
