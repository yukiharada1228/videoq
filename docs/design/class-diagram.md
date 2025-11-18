# Class Diagram

## Overview

This diagram shows the backend models and frontend components of the Ask Video system.

## Backend Models (Django)

```mermaid
classDiagram
    class User {
        +int id
        +string username
        +string email
        +string encrypted_openai_api_key
        +int video_limit
        +datetime date_joined
        +bool is_active
        +bool is_staff
        +bool is_superuser
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
        +bool is_external_upload
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
    
    class SafeStorageMixin {
        +get_available_name()
        +_get_safe_filename()
    }
    
    class SafeFileSystemStorage {
        +get_available_name()
    }
    
    class SafeS3Boto3Storage {
        +__init__()
        +get_available_name()
    }
    
    User "1" --> "*" Video : owns
    User "1" --> "*" VideoGroup : owns
    User "1" --> "*" ChatLog : creates
    VideoGroup "1" --> "*" VideoGroupMember : contains
    Video "1" --> "*" VideoGroupMember : belongs_to
    VideoGroup "1" --> "*" ChatLog : has
    SafeFileSystemStorage --|> SafeStorageMixin : extends
    SafeS3Boto3Storage --|> SafeStorageMixin : extends
    Video --> SafeFileSystemStorage : uses
    Video --> SafeS3Boto3Storage : uses
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
        +bool hasApiKey
        +int groupId
        +function onVideoPlay
        +string shareToken
        +string className
        +handleSend()
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
    
    PageLayout "1" --> "1" Header : contains
    PageLayout "1" --> "1" Footer : contains
    AuthForm "1" --> "*" FormField : contains
    VideoList "1" --> "*" VideoCard : contains
    ChatPanel --> LoadingState : uses
    I18nProvider --> PageLayout : wraps
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
