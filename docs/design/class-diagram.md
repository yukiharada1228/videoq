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
        +string external_id (unique, nullable)
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

## Backend Views (Django REST Framework)

```mermaid
classDiagram
    class BaseVideoView {
        +get_queryset()
        +should_include_groups()
        +should_include_transcript()
    }
    
    class VideoListView {
        +serializer_map
        +get_queryset()
        +create()
    }
    
    class VideoDetailView {
        +serializer_map
        +should_include_groups()
        +should_include_transcript()
        +update()
        +destroy()
    }
    
    class BaseVideoGroupView {
        +_get_filtered_queryset()
    }
    
    class VideoGroupListView {
        +serializer_map
        +get_queryset()
    }
    
    class VideoGroupDetailView {
        +serializer_map
        +get_queryset()
    }
    
    class ChatView {
        +post()
    }
    
    class ChatHistoryView {
        +get_queryset()
    }
    
    class LoginView {
        +post()
    }
    
    class UserSignupView {
        +create()
    }
    
    BaseVideoView <|-- VideoListView
    BaseVideoView <|-- VideoDetailView
    BaseVideoGroupView <|-- VideoGroupListView
    BaseVideoGroupView <|-- VideoGroupDetailView
```

## Key Relationships

### Backend
- **User** owns multiple **Video** instances
- **User** owns multiple **VideoGroup** instances
- **VideoGroup** relates to multiple **Video** instances through **VideoGroupMember**
- **ChatLog** is associated with **User** and **VideoGroup**
- **Video** uses **SafeFileSystemStorage** or **SafeS3Boto3Storage**

### Frontend
- **PageLayout** contains **Header** and **Footer**
- **AuthForm** contains multiple **FormField** instances
- **VideoList** contains multiple **VideoCard** instances
- **I18nProvider** wraps the entire application
