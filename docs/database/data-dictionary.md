# データ辞書

## 概要

VideoQシステムのデータベーステーブルとカラムの定義を提供するドキュメントです。

**注記**
- このプロジェクトは **PostgreSQL** と Django の `BigAutoField` をデフォルトで使用しているため、主キーは通常 `BIGINT` です。
- Djangoの `DateTimeField` の値は、タイムゾーンが有効な場合、PostgreSQLでは `TIMESTAMPTZ`（タイムゾーン付きタイムスタンプ）として保存されます。
- 最新のリファレンスはコード: `backend/app/infrastructure/models/` および `backend/app/migrations/` です。

## Userテーブル

### テーブル名
`app_user` (custom user model, inherits from Django's `AbstractUser`)

### 説明
システムのユーザー情報を保存するテーブルです。
アカウント無効化時は、`is_active=False` と `deactivated_at` 設定に加えて、`username` と `email` が一意な退会済みプレースホルダー値へ更新されます。

### カラム定義

| カラム名 | データ型 | 制約 | デフォルト値 | 説明 |
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
| deactivated_at | TIMESTAMPTZ | NULL | NULL | Date and time when the account was deactivated (soft delete). `NULL` means the account is active. |

### インデックス
- PRIMARY KEY: `id`
- UNIQUE: `username`
- UNIQUE: `email`
- INDEX: `(email, is_active)` (for login lookup)
- INDEX: `(date_joined, -id)` (for user listing)
- INDEX: `deactivated_at` (for deactivated account queries)
- INDEX: `video_limit` (for limit queries)

### リレーション
- `videos`: One-to-many relationship with Video table
- `video_groups`: One-to-many relationship with VideoGroup table
- `chat_logs`: One-to-many relationship with ChatLog table
- `tags`: One-to-many relationship with Tag table
- `account_deletion_requests`: One-to-many relationship with AccountDeletionRequest table
- `api_keys`: One-to-many relationship with UserApiKey table

---

## AccountDeletionRequestテーブル

### テーブル名
`app_accountdeletionrequest`

### 説明
アカウント削除リクエストと理由を保存するテーブルです。

### カラム定義

| カラム名 | データ型 | 制約 | デフォルト値 | 説明 |
|------------|-----------|-------------|---------------|-------------|
| id | BIGINT | PRIMARY KEY, AUTO_INCREMENT | - | Request ID |
| user_id | BIGINT | FOREIGN KEY, NOT NULL | - | User ID |
| reason | TEXT | NOT NULL | '' | Reason for deletion |
| requested_at | TIMESTAMPTZ | NOT NULL | now() | Requested date and time |

### インデックス
- PRIMARY KEY: `id`
- FOREIGN KEY: `user_id` → `app_user.id` (CASCADE)
- INDEX: `(user_id, -requested_at)`（最新リクエスト監視用）

### リレーション
- `user`: Userテーブルとの多対1リレーション

---

## Videoテーブル

### テーブル名
`app_video`

### 説明
アップロードされた動画の情報を保存するテーブルです。

### カラム定義

| カラム名 | データ型 | 制約 | デフォルト値 | 説明 |
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

### statusの値
- `pending`: 処理待ち
- `processing`: 処理中
- `indexing`: 文字起こし保存済み; ベクトルインデックス作成中
- `completed`: 完了
- `error`: エラー

### インデックス
- PRIMARY KEY: `id`
- FOREIGN KEY: `user_id` → `app_user.id` (CASCADE)
- INDEX: `uploaded_at`（降順ソート用）
- INDEX: `(user_id, status, -uploaded_at)`（フィルタ付き一覧用）
- INDEX: `(user_id, title)`（ユーザー別タイトル検索用）

### リレーション
- `user`: Userテーブルとの多対1リレーション
- `groups`: VideoGroupMemberテーブル経由の多対多リレーション
- `video_tags`: VideoTagテーブルとの1対多リレーション
- `tags`: VideoTagテーブル経由の多対多リレーション

---

## VideoGroupテーブル

### テーブル名
`app_videogroup`

### 説明
動画をグループ化するためのテーブルです。

### カラム定義

| カラム名 | データ型 | 制約 | デフォルト値 | 説明 |
|------------|-----------|-------------|---------------|-------------|
| id | BIGINT | PRIMARY KEY, AUTO_INCREMENT | - | Group ID |
| user_id | BIGINT | FOREIGN KEY, NOT NULL | - | Owner's user ID |
| name | VARCHAR(255) | NOT NULL | - | Group name |
| description | TEXT | NOT NULL | '' | Group description |
| created_at | TIMESTAMPTZ | NOT NULL | now() | Creation date and time |
| updated_at | TIMESTAMPTZ | NOT NULL | now() | Update date and time |
| share_token | VARCHAR(64) | UNIQUE, NULL | NULL | Share token |

### インデックス
- PRIMARY KEY: `id`
- FOREIGN KEY: `user_id` → `app_user.id` (CASCADE)
- UNIQUE: `share_token`（NULL許容）
- INDEX: `(user_id, -created_at)`（オーナー一覧用）
- INDEX（部分）: `share_token` WHERE `share_token IS NOT NULL`（共有トークン検索用）

### リレーション
- `user`: Userテーブルとの多対1リレーション
- `videos`: VideoGroupMemberテーブル経由の多対多リレーション
- `chat_logs`: ChatLogテーブルとの1対多リレーション

---

## VideoGroupMemberテーブル

### テーブル名
`app_videogroupmember`

### 説明
動画とグループの関連を管理する中間テーブルです。

### カラム定義

| カラム名 | データ型 | 制約 | デフォルト値 | 説明 |
|------------|-----------|-------------|---------------|-------------|
| id | BIGINT | PRIMARY KEY, AUTO_INCREMENT | - | Member ID |
| group_id | BIGINT | FOREIGN KEY, NOT NULL | - | Group ID |
| video_id | BIGINT | FOREIGN KEY, NOT NULL | - | Video ID |
| added_at | TIMESTAMPTZ | NOT NULL | now() | Addition date and time |
| order | INTEGER | NOT NULL | 0 | Order within group |

### インデックス
- PRIMARY KEY: `id`
- FOREIGN KEY: `group_id` → `app_videogroup.id` (CASCADE)
- FOREIGN KEY: `video_id` → `app_video.id` (CASCADE)
- UNIQUE: `(group_id, video_id)`（同じ動画を同じグループに複数回追加不可）
- INDEX: `(group_id, order)`（グループ再生/順序取得用）
- INDEX: `(video_id, group_id)`（メンバーシップ検索用）

### リレーション
- `group`: VideoGroupテーブルとの多対1リレーション
- `video`: Videoテーブルとの多対1リレーション

---

## Tagテーブル

### テーブル名
`app_tag`

### 説明
動画を整理するためのユーザー定義タグを保存するテーブルです。

### カラム定義

| カラム名 | データ型 | 制約 | デフォルト値 | 説明 |
|------------|-----------|-------------|---------------|-------------|
| id | BIGINT | PRIMARY KEY, AUTO_INCREMENT | - | Tag ID |
| user_id | BIGINT | FOREIGN KEY, NOT NULL | - | オーナーのユーザーID |
| name | VARCHAR(50) | NOT NULL | - | タグ名 |
| color | VARCHAR(7) | NOT NULL | '#3B82F6' | タグの色（16進数形式 #RRGGBB） |
| created_at | TIMESTAMPTZ | NOT NULL | now() | 作成日時 |

### インデックス
- PRIMARY KEY: `id`
- FOREIGN KEY: `user_id` → `app_user.id` (CASCADE)
- UNIQUE: `(user_id, name)`（ユーザーごとにユニークなタグ名）
- INDEX: `(user_id, name)`（ユーザー別タグ一覧/ソート用）

### リレーション
- `user`: Userテーブルとの多対1リレーション
- `video_tags`: VideoTagテーブルとの1対多リレーション
- `videos_through`: VideoTagテーブル経由の多対多リレーション

---

## VideoTagテーブル

### テーブル名
`app_videotag`

### 説明
VideoとTagの多対多リレーションの中間テーブルです。

### カラム定義

| カラム名 | データ型 | 制約 | デフォルト値 | 説明 |
|------------|-----------|-------------|---------------|-------------|
| id | BIGINT | PRIMARY KEY, AUTO_INCREMENT | - | VideoTag ID |
| video_id | BIGINT | FOREIGN KEY, NOT NULL | - | 動画ID |
| tag_id | BIGINT | FOREIGN KEY, NOT NULL | - | タグID |
| added_at | TIMESTAMPTZ | NOT NULL | now() | タグ付与日時 |

### インデックス
- PRIMARY KEY: `id`
- FOREIGN KEY: `video_id` → `app_video.id` (CASCADE)
- FOREIGN KEY: `tag_id` → `app_tag.id` (CASCADE)
- UNIQUE: `(video_id, tag_id)`（重複タグ付与防止）
- INDEX: `(video_id, tag_id)`（動画からの結合/検索用）
- INDEX: `(tag_id, -added_at)`（タグ別最新使用用）

### リレーション
- `video`: Videoテーブルとの多対1リレーション
- `tag`: Tagテーブルとの多対1リレーション

---

## ChatLogテーブル

### テーブル名
`app_chatlog`

### 説明
チャット履歴を保存するテーブルです。

### カラム定義

| カラム名 | データ型 | 制約 | デフォルト値 | 説明 |
|------------|-----------|-------------|---------------|-------------|
| id | BIGINT | PRIMARY KEY, AUTO_INCREMENT | - | チャットログID |
| user_id | BIGINT | FOREIGN KEY, NOT NULL | - | ユーザーID |
| group_id | BIGINT | FOREIGN KEY, NOT NULL | - | グループID |
| question | TEXT | NOT NULL | - | 質問テキスト |
| answer | TEXT | NOT NULL | - | 回答テキスト |
| related_videos | JSONB | NOT NULL | [] | 関連動画IDのリスト |
| is_shared_origin | BOOLEAN | NOT NULL | False | 共有リンク経由のチャットかどうか |
| feedback | VARCHAR(4) | NULL | NULL | フィードバック ('good', 'bad', NULL) |
| created_at | TIMESTAMPTZ | NOT NULL | now() | 作成日時 |

### feedbackの値
- `good`: 良い評価
- `bad`: 悪い評価
- `NULL`: フィードバックなし

### インデックス
- PRIMARY KEY: `id`
- FOREIGN KEY: `user_id` → `app_user.id` (CASCADE)
- FOREIGN KEY: `group_id` → `app_videogroup.id` (CASCADE)
- INDEX: `created_at`（降順ソート用）
- INDEX: `(user_id, -created_at)`（ユーザー履歴用）
- INDEX: `(group_id, -created_at)`（グループ履歴用）
- INDEX（部分）: `feedback` WHERE `feedback IS NOT NULL`（フィードバック分析用）

### リレーション
- `user`: Userテーブルとの多対1リレーション
- `group`: VideoGroupテーブルとの多対1リレーション

---

## UserApiKeyテーブル

### テーブル名
`app_userapikey`

### 説明
サーバー間連携用のAPIキーを保存するテーブルです。APIキーにより、JWTクッキーベースの認証なしでVideoQ APIへのプログラマティックアクセスが可能になります。

### カラム定義

| カラム名 | データ型 | 制約 | デフォルト値 | 説明 |
|------------|-----------|-------------|---------------|-------------|
| id | BIGINT | PRIMARY KEY, AUTO_INCREMENT | - | APIキーID |
| user_id | BIGINT | FOREIGN KEY, NOT NULL | - | オーナーのユーザーID |
| name | VARCHAR(100) | NOT NULL | - | APIキーの識別名 |
| access_level | VARCHAR(20) | NOT NULL | 'all' | 権限レベル ('all' または 'read_only') |
| prefix | VARCHAR(12) | NOT NULL | - | 生キーの先頭12文字（表示識別用） |
| hashed_key | VARCHAR(64) | UNIQUE, NOT NULL | - | 生 APIキーのSHA-256ハッシュ |
| last_used_at | TIMESTAMPTZ | NULL | NULL | キーの最終使用日時 |
| revoked_at | TIMESTAMPTZ | NULL | NULL | キーの失効日時（`NULL` = アクティブ） |
| created_at | TIMESTAMPTZ | NOT NULL | now() | 作成日時 |

### access_levelの値
- `all`: 全読み書きアクセス
- `read_only`: readスコープ + `chat_write` スコープ（`POST /api/chat/` は許可、その他の書き込み操作はブロック）

### インデックス
- PRIMARY KEY: `id`
- FOREIGN KEY: `user_id` → `app_user.id` (CASCADE)
- UNIQUE: `hashed_key`
- UNIQUE（部分）: `(user_id, name)` WHERE `revoked_at IS NULL`（アクティブなAPIキー名はユーザーごとにユニーク）
- INDEX: `prefix`（APIキープレフィックス検索用）
- INDEX: `revoked_at`（アクティブ/失効キークエリ用）

### リレーション
- `user`: Userテーブルとの多対1リレーション

---

## PGVectorコレクション

### コレクション名
`videoq_scenes`（`PGVECTOR_COLLECTION_NAME` 環境変数で設定可能）

### 説明
ベクトル化された動画シーンを保存するコレクションです。

### スキーマ

| カラム名 | データ型 | 説明 |
|------------|-----------|-------------|
| id | UUID | ベクトルID |
| embedding | vector(1536) | テキストエンベディングベクトル（次元数は `EMBEDDING_VECTOR_SIZE` 環境変数で設定可能; モデルは `EMBEDDING_MODEL` 環境変数で設定可能、デフォルト: text-embedding-3-small/1536） |
| document | TEXT | シーンテキスト内容 |
| metadata | JSONB | メタデータ |

### metadata構成
```json
{
  "video_id": 123,
  "user_id": 456,
  "video_title": "Sample Video",
  "start_time": "00:01:23,456",
  "end_time": "00:01:45,789",
  "start_sec": 83.456,
  "end_sec": 105.789,
  "scene_index": 5
}
```

### インデックス
- PRIMARY KEY: `id`
- INDEX: `embedding`（ベクトル検索用、HNSW または IVFFlat）

### 目的
- RAG（Retrieval-Augmented Generation）のための関連シーン検索
- 類似検索によるコンテキスト構築

---

## データ型詳細

### 文字列型
- `VARCHAR(n)`: 最大n文字の可変長文字列
- `TEXT`: 無制限の文字列

### 数値型
- `INTEGER`: 32ビット整数
- `BIGINT`: 64ビット整数
- `BOOLEAN`: ブール値

### 日時型
- `TIMESTAMPTZ`: タイムゾーン付きタイムスタンプ（PostgreSQL）

### JSON型
- `JSON`: JSONデータ（PostgreSQL 9.2+）
- `JSONB`: バイナリJSON（高速検索可能）

### ベクトル型
- `vector(n)`: n次元ベクトル（pgvector拡張）

---

## 制約詳細

### 主キー制約
全テーブルで `id` が主キーとして設定されています。

### 外部キー制約
全外部キーに `ON DELETE CASCADE` が設定されており、親レコード削除時に子レコードが自動的に削除されます。

### ユニーク制約
- `User.username`: ユーザー名はユニーク
- `User.email`: メールアドレスはユニーク
- `VideoGroup.share_token`: 共有トークンはユニーク（NULL許容）
- `VideoGroupMember(group_id, video_id)`: 同じ動画を同じグループに複数回追加不可
- `UserApiKey.hashed_key`: ハッシュ済みAPIキーはユニーク
- `UserApiKey(user, name)` WHERE `revoked_at IS NULL`: アクティブなAPIキー名はユーザーごとにユニーク

### チェック制約
- `Video.status`: 指定された値のみ許可
- `ChatLog.feedback`: 指定された値またはNULLのみ許可
- `UserApiKey.access_level`: 'all' または 'read_only' のみ許可

---

## Related Documentation

- [📖 ドキュメント一覧](../README.md)
- [ER図](er-diagram.md) — エンティティ関連図
- [データフロー図](data-flow-diagram.md) — 機能ごとのデータの流れ
- [クラス図](../design/class-diagram.md) — モデルクラスの詳細
- [コンポーネント図](../design/component-diagram.md) — バックエンドコンポーネント構成
