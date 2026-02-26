# Data Dictionary

## Overview

This document provides definitions of database tables and columns for the VideoQ system.

**Notes**
- This project uses **PostgreSQL** and Django's `BigAutoField` by default, so primary keys are typically `BIGINT`.
- Django `DateTimeField` values are stored as `TIMESTAMPTZ` (timestamp with time zone) in PostgreSQL when time zones are enabled.
- The most up-to-date reference is the code: `backend/app/models.py` and `backend/app/migrations/`.

## User Table

### Table Name
`app_user` (custom user model, inherits from Django's `AbstractUser`)

### Description
Table that stores user information for the system.

### Column Definitions

| Column Name | Data Type | Constraints | Default Value | Description |
|------------|-----------|-------------|---------------|-------------|
| id | BIGINT | PRIMARY KEY, AUTO_INCREMENT | - | User ID |
| username | VARCHAR(150) | UNIQUE, NOT NULL | - | Username |
| email | VARCHAR(255) | UNIQUE, NOT NULL | - | Email address |
| password | VARCHAR(128) | NOT NULL | - | Hashed password |
| date_joined | TIMESTAMPTZ | NOT NULL | now() | Registration date and time |
| last_login | TIMESTAMPTZ | NULL | NULL | Last login date and time |
| is_active | BOOLEAN | NOT NULL | True | Active status (the signup flow sets this to `False` until email verification) |
| is_staff | BOOLEAN | NOT NULL | False | Staff permissions |
| is_superuser | BOOLEAN | NOT NULL | False | Superuser permissions |
| first_name | VARCHAR(150) | NOT NULL | '' | First name |
| last_name | VARCHAR(150) | NOT NULL | '' | Last name |
| video_limit | INTEGER | NULL, CHECK (video_limit >= 0) | 0 | Max number of videos the user can upload (`NULL` = unlimited, `0` = uploads disabled) |

### Indexes
- PRIMARY KEY: `id`
- UNIQUE: `username`
- UNIQUE: `email`

### Relations
- `videos`: One-to-many relationship with Video table
- `video_groups`: One-to-many relationship with VideoGroup table
- `chat_logs`: One-to-many relationship with ChatLog table
- `tags`: One-to-many relationship with Tag table
- `account_deletion_requests`: One-to-many relationship with AccountDeletionRequest table

---

## AccountDeletionRequest Table

### Table Name
`app_accountdeletionrequest`

### Description
Table that stores user requests for account deletion and reasons.

### Column Definitions

| Column Name | Data Type | Constraints | Default Value | Description |
|------------|-----------|-------------|---------------|-------------|
| id | BIGINT | PRIMARY KEY, AUTO_INCREMENT | - | Request ID |
| user_id | BIGINT | FOREIGN KEY, NOT NULL | - | User ID |
| reason | TEXT | NOT NULL | '' | Reason for deletion |
| requested_at | TIMESTAMPTZ | NOT NULL | now() | Requested date and time |

### Indexes
- PRIMARY KEY: `id`
- FOREIGN KEY: `user_id` → `app_user.id` (CASCADE)
- INDEX: `(user_id, -requested_at)` (for monitoring latest requests)

### Relations
- `user`: Many-to-one relationship with User table

---

## Video Table

### Table Name
`app_video`

### Description
Table that stores information about uploaded videos.

### Column Definitions

| Column Name | Data Type | Constraints | Default Value | Description |
|------------|-----------|-------------|---------------|-------------|
| id | BIGINT | PRIMARY KEY, AUTO_INCREMENT | - | Video ID |
| user_id | BIGINT | FOREIGN KEY, NOT NULL | - | Owner's user ID |
| file | VARCHAR(100) | NOT NULL | - | Video file path (Django `FileField`, default `max_length=100`) |
| title | VARCHAR(255) | NOT NULL | - | Video title |
| description | TEXT | NOT NULL | '' | Video description |
| uploaded_at | TIMESTAMPTZ | NOT NULL | now() | Upload date and time |
| transcript | TEXT | NOT NULL | '' | Transcription result (SRT format) |
| status | VARCHAR(20) | NOT NULL | 'pending' | Processing status |
| error_message | TEXT | NOT NULL | '' | Error message (when error occurs) |
| external_id | VARCHAR(255) | UNIQUE, NULL | NULL | ID from external LMS (e.g., Moodle cm_id, Canvas content_id) |

### status Values
- `pending`: Waiting for processing
- `processing`: Processing
- `completed`: Completed
- `error`: Error

### Indexes
- PRIMARY KEY: `id`
- FOREIGN KEY: `user_id` → `app_user.id` (CASCADE)
- UNIQUE: `external_id` (NULL allowed)
- INDEX: `uploaded_at` (for descending sort)

### Relations
- `user`: Many-to-one relationship with User table
- `groups`: Many-to-many relationship through VideoGroupMember table
- `video_tags`: One-to-many relationship with VideoTag table
- `tags`: Many-to-many relationship through VideoTag table

---

## VideoGroup Table

### Table Name
`app_videogroup`

### Description
Table for grouping videos.

### Column Definitions

| Column Name | Data Type | Constraints | Default Value | Description |
|------------|-----------|-------------|---------------|-------------|
| id | BIGINT | PRIMARY KEY, AUTO_INCREMENT | - | Group ID |
| user_id | BIGINT | FOREIGN KEY, NOT NULL | - | Owner's user ID |
| name | VARCHAR(255) | NOT NULL | - | Group name |
| description | TEXT | NOT NULL | '' | Group description |
| created_at | TIMESTAMPTZ | NOT NULL | now() | Creation date and time |
| updated_at | TIMESTAMPTZ | NOT NULL | now() | Update date and time |
| share_token | VARCHAR(64) | UNIQUE, NULL | NULL | Share token |

### Indexes
- PRIMARY KEY: `id`
- FOREIGN KEY: `user_id` → `app_user.id` (CASCADE)
- UNIQUE: `share_token` (NULL allowed)
- INDEX: `created_at` (for descending sort)

### Relations
- `user`: Many-to-one relationship with User table
- `videos`: Many-to-many relationship through VideoGroupMember table
- `chat_logs`: One-to-many relationship with ChatLog table

---

## VideoGroupMember Table

### Table Name
`app_videogroupmember`

### Description
Intermediate table that manages the relationship between videos and groups.

### Column Definitions

| Column Name | Data Type | Constraints | Default Value | Description |
|------------|-----------|-------------|---------------|-------------|
| id | BIGINT | PRIMARY KEY, AUTO_INCREMENT | - | Member ID |
| group_id | BIGINT | FOREIGN KEY, NOT NULL | - | Group ID |
| video_id | BIGINT | FOREIGN KEY, NOT NULL | - | Video ID |
| added_at | TIMESTAMPTZ | NOT NULL | now() | Addition date and time |
| order | INTEGER | NOT NULL | 0 | Order within group |

### Indexes
- PRIMARY KEY: `id`
- FOREIGN KEY: `group_id` → `app_videogroup.id` (CASCADE)
- FOREIGN KEY: `video_id` → `app_video.id` (CASCADE)
- UNIQUE: `(group_id, video_id)` (cannot add the same video to the same group multiple times)
- INDEX: `(order, added_at)` (for order sorting)

### Relations
- `group`: Many-to-one relationship with VideoGroup table
- `video`: Many-to-one relationship with Video table

---

## Tag Table

### Table Name
`app_tag`

### Description
Table that stores user-defined tags for organizing videos.

### Column Definitions

| Column Name | Data Type | Constraints | Default Value | Description |
|------------|-----------|-------------|---------------|-------------|
| id | BIGINT | PRIMARY KEY, AUTO_INCREMENT | - | Tag ID |
| user_id | BIGINT | FOREIGN KEY, NOT NULL | - | Owner's user ID |
| name | VARCHAR(50) | NOT NULL | - | Tag name |
| color | VARCHAR(7) | NOT NULL | '#3B82F6' | Tag color in hex format (#RRGGBB) |
| created_at | TIMESTAMPTZ | NOT NULL | now() | Creation date and time |

### Indexes
- PRIMARY KEY: `id`
- FOREIGN KEY: `user_id` → `app_user.id` (CASCADE)
- UNIQUE: `(user_id, name)` (per-user unique tag names)
- INDEX: `name` (for ordering)

### Relations
- `user`: Many-to-one relationship with User table
- `video_tags`: One-to-many relationship with VideoTag table
- `videos_through`: Many-to-many relationship through VideoTag table

---

## VideoTag Table

### Table Name
`app_videotag`

### Description
Intermediate table for many-to-many relationship between Video and Tag.

### Column Definitions

| Column Name | Data Type | Constraints | Default Value | Description |
|------------|-----------|-------------|---------------|-------------|
| id | BIGINT | PRIMARY KEY, AUTO_INCREMENT | - | VideoTag ID |
| video_id | BIGINT | FOREIGN KEY, NOT NULL | - | Video ID |
| tag_id | BIGINT | FOREIGN KEY, NOT NULL | - | Tag ID |
| added_at | TIMESTAMPTZ | NOT NULL | now() | Tag assignment date and time |

### Indexes
- PRIMARY KEY: `id`
- FOREIGN KEY: `video_id` → `app_video.id` (CASCADE)
- FOREIGN KEY: `tag_id` → `app_tag.id` (CASCADE)
- UNIQUE: `(video_id, tag_id)` (prevent duplicate tag assignments)
- INDEX: `tag__name` (for ordering by tag name)

### Relations
- `video`: Many-to-one relationship with Video table
- `tag`: Many-to-one relationship with Tag table

---

## ChatLog Table

### Table Name
`app_chatlog`

### Description
Table that stores chat history.

### Column Definitions

| Column Name | Data Type | Constraints | Default Value | Description |
|------------|-----------|-------------|---------------|-------------|
| id | BIGINT | PRIMARY KEY, AUTO_INCREMENT | - | Chat log ID |
| user_id | BIGINT | FOREIGN KEY, NOT NULL | - | User ID (owner or owner when accessed via share) |
| group_id | BIGINT | FOREIGN KEY, NOT NULL | - | Group ID |
| question | TEXT | NOT NULL | - | Question text |
| answer | TEXT | NOT NULL | - | Answer text |
| related_videos | JSONB | NOT NULL | [] | List of related video IDs |
| is_shared_origin | BOOLEAN | NOT NULL | False | Whether chat was via share link |
| feedback | VARCHAR(4) | NULL | NULL | Feedback ('good', 'bad', NULL) |
| created_at | TIMESTAMPTZ | NOT NULL | now() | Creation date and time |

### feedback Values
- `good`: Good rating
- `bad`: Bad rating
- `NULL`: No feedback

### Indexes
- PRIMARY KEY: `id`
- FOREIGN KEY: `user_id` → `app_user.id` (CASCADE)
- FOREIGN KEY: `group_id` → `app_videogroup.id` (CASCADE)
- INDEX: `created_at` (for descending sort)

### Relations
- `user`: Many-to-one relationship with User table
- `group`: Many-to-one relationship with VideoGroup table

---

## PGVector Collection

### Collection Name
`video_scenes` (configurable)

### Description
Collection that stores vectorized video scenes.

### Schema

| Column Name | Data Type | Description |
|------------|-----------|-------------|
| id | UUID | Vector ID |
| embedding | vector(1536) | Text embedding vector (configurable via `EMBEDDING_MODEL` env var, default: text-embedding-3-small) |
| document | TEXT | Scene text content |
| metadata | JSONB | Metadata |

### metadata Structure
```json
{
  "video_id": 123,
  "user_id": 456,
  "video_title": "Sample Video",
  "start_time": "00:01:23,456",
  "end_time": "00:01:45,789",
  "start_sec": 83.456,
  "end_sec": 105.789,
  "scene_index": 5,
  "external_id": "moodle_cm_12345"
}
```

**Note**: The `external_id` field is optional and only included when the video has an associated external LMS identifier.

### Indexes
- PRIMARY KEY: `id`
- INDEX: `embedding` (for vector search, HNSW or IVFFlat)

### Purpose
- Related scene search for RAG (Retrieval-Augmented Generation)
- Context building through similarity search

---

## Data Type Details

### String Types
- `VARCHAR(n)`: Variable-length string with maximum n characters
- `TEXT`: Unlimited string

### Numeric Types
- `INTEGER`: 32-bit integer
- `BIGINT`: 64-bit integer
- `BOOLEAN`: Boolean value

### DateTime Types
- `TIMESTAMPTZ`: Timestamp with time zone (PostgreSQL)

### JSON Types
- `JSON`: JSON data (PostgreSQL 9.2+)
- `JSONB`: Binary JSON (fast searchable)

### Vector Types
- `vector(n)`: n-dimensional vector (pgvector extension)

---

## Constraint Details

### Primary Key Constraints
All tables have `id` set as the primary key.

### Foreign Key Constraints
All foreign keys have `ON DELETE CASCADE` set, so child records are automatically deleted when parent records are deleted.

### Unique Constraints
- `User.username`: Username is unique
- `User.email`: Email address is unique
- `Video.external_id`: External LMS ID is unique (NULL allowed)
- `VideoGroup.share_token`: Share token is unique (NULL allowed)
- `VideoGroupMember(group_id, video_id)`: Cannot add the same video to the same group multiple times

### Check Constraints
- `Video.status`: Only specified values allowed
- `ChatLog.feedback`: Only specified values or NULL allowed
