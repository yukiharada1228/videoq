# Ask Video

動画の文字起こしとAIチャット機能を提供するWebアプリケーションです。

## 概要

このアプリケーションは、動画のアップロード、自動文字起こし、AIチャットなどの機能を提供します。ユーザーは動画をアップロードすると、自動的に文字起こし処理が行われ、その内容に対してAIチャットで質問することができます。

### 主な機能

- **ユーザー認証**: JWTによる認証システム
- **動画アップロード**: 複数の動画形式に対応
- **自動文字起こし**: Whisper APIによる自動文字起こし（Celeryバックグラウンド処理）
- **AIチャット**: OpenAI APIによる動画内容についての質問応答
- **動画グループ管理**: 複数の動画をグループ化して管理
- **共有機能**: 共有トークンによる動画グループの共有
- **保護されたメディア配信**: 認証によるメディアファイルの安全な配信

## プロジェクト構成

```
ask-video/
├── backend/                    # Django REST Framework バックエンド
│   ├── app/                     # メインアプリケーション
│   │   ├── auth/                # 認証機能（views, serializers, urls）
│   │   ├── video/               # 動画管理機能（views, serializers, urls, tests）
│   │   ├── chat/                # チャット機能（views, serializers, urls, langchain_utils）
│   │   ├── scene_otsu/          # シーン分割機能
│   │   ├── utils/               # ユーティリティ（encryption, vector_manager, task_helpers等）
│   │   ├── migrations/          # データベースマイグレーション
│   │   ├── models.py            # データモデル（User, Video, VideoGroup, ChatLog等）
│   │   ├── tasks.py             # Celeryタスク（文字起こし処理等）
│   │   ├── authentication.py   # カスタム認証クラス
│   │   └── celery_config.py     # Celery設定
│   ├── ask_video/               # Djangoプロジェクト設定
│   │   ├── settings.py          # Django設定
│   │   ├── urls.py              # URL設定
│   │   ├── wsgi.py              # WSGI設定
│   │   └── asgi.py              # ASGI設定
│   ├── media/                   # アップロードされたメディアファイル
│   ├── pyproject.toml           # Python依存関係（uv）
│   ├── uv.lock                   # uv依存関係ロックファイル
│   ├── main.py                  # エントリーポイント
│   ├── manage.py                # Django管理スクリプト
│   ├── Dockerfile               # バックエンドDockerイメージ
│   └── README.md                # バックエンドREADME
├── frontend/                    # Next.js + TypeScript フロントエンド
│   ├── app/                     # Next.js App Router
│   │   ├── page.tsx             # ホームページ
│   │   ├── login/               # ログインページ
│   │   ├── signup/              # サインアップページ
│   │   ├── settings/            # 設定ページ
│   │   ├── videos/              # 動画関連ページ
│   │   │   ├── page.tsx         # 動画一覧ページ
│   │   │   ├── [id]/            # 動画詳細ページ
│   │   │   └── groups/           # 動画グループページ
│   │   └── share/               # 共有ページ
│   │       └── [token]/         # 共有トークンページ
│   ├── components/              # Reactコンポーネント
│   │   ├── auth/                # 認証コンポーネント
│   │   ├── video/               # 動画関連コンポーネント
│   │   ├── chat/                # チャットコンポーネント
│   │   ├── layout/              # レイアウトコンポーネント
│   │   ├── common/              # 共通コンポーネント
│   │   └── ui/                  # UIコンポーネント（shadcn/ui）
│   ├── hooks/                   # カスタムフック（useAuth, useVideos等）
│   ├── lib/                     # ライブラリ・ユーティリティ（api, errorUtils等）
│   ├── e2e/                     # Playwright E2Eテスト
│   ├── package.json             # Node.js依存関係
│   ├── package-lock.json         # npm依存関係ロックファイル
│   ├── Dockerfile               # フロントエンドDockerイメージ
│   └── README.md                # フロントエンドREADME
├── docker-compose.yml           # Docker Compose設定
├── nginx.conf                   # Nginx設定
└── README.md                    # このファイル
```

## 使用技術

### バックエンド

#### フレームワーク・API
- **Django** (>=5.2.7) - Webフレームワーク
- **Django REST Framework** (>=3.16.1) - REST API構築
- **django-rest-framework-simplejwt** (>=5.5.1) - JWT認証システム
- **django-cors-headers** (>=4.9.0) - CORS設定

#### サーバー・WSGI
- **Gunicorn** (>=23.0.0) - WSGIサーバー
- **Uvicorn** (>=0.38.0) - ASGIサーバー
- **uvicorn-worker** (>=0.4.0) - Uvicornワーカー

#### バックグラウンド処理
- **Celery** (>=5.5.3) - バックグラウンドタスク処理
- **Redis** (>=7.0.0) - Celeryブローカー・キュー管理

#### データベース
- **PostgreSQL** (17, pgvector拡張付き) - リレーショナルデータベース
- **psycopg2-binary** (>=2.9.11) - PostgreSQLアダプタ
- **dj-database-url** (>=3.0.1) - データベースURLパーサー
- **pgvector** (>=0.3.0) - PostgreSQL拡張（ベクトルデータベース）

#### AI・機械学習
- **OpenAI** (>=2.6.1) - OpenAI APIクライアント（Whisper API、ChatGPT）
- **LangChain** (>=1.0.2) - LLMアプリケーションフレームワーク
- **langchain-openai** (>=1.0.1) - LangChain OpenAI統合
- **langchain-postgres** (>=0.0.16) - LangChain PostgreSQL統合
- **numpy** (>=2.0.0) - 数値計算ライブラリ
- **scikit-learn** (>=1.7.2) - 機械学習ライブラリ

#### 動画・音声処理
- **ffmpeg** - 動画・音声変換ツール（システムレベル、Dockerfileでインストール）

#### ストレージ
- **django-storages** (>=1.14.6) - Djangoストレージバックエンド（S3対応）
- **boto3** (>=1.40.64) - AWS SDK for Python（S3等）

#### セキュリティ・暗号化
- **cryptography** (>=46.0.3) - 暗号化ライブラリ（APIキー暗号化）

#### パッケージ管理
- **uv** - 高速なPythonパッケージマネージャー

### フロントエンド

#### フレームワーク・ランタイム
- **Next.js** (16.0.0) - React フレームワーク
- **React** (19.2.0) - UIライブラリ
- **React DOM** (19.2.0) - React DOMレンダラー
- **TypeScript** (^5) - 型安全性

#### UIコンポーネント・スタイリング
- **Tailwind CSS** (^4) - ユーティリティファーストCSSフレームワーク
- **@tailwindcss/postcss** (^4) - Tailwind CSS PostCSSプラグイン
- **tw-animate-css** (^1.4.0) - Tailwind CSSアニメーション
- **Radix UI** - アクセシブルなUIコンポーネントプリミティブ
  - **@radix-ui/react-checkbox** (^1.3.3) - チェックボックスコンポーネント
  - **@radix-ui/react-dialog** (^1.1.15) - ダイアログコンポーネント
  - **@radix-ui/react-label** (^2.1.7) - ラベルコンポーネント
  - **@radix-ui/react-slot** (^1.2.3) - スロットコンポーネント
- **lucide-react** (^0.548.0) - アイコンライブラリ
- **class-variance-authority** (^0.7.1) - コンポーネントバリアント管理
- **clsx** (^2.1.1) - クラス名ユーティリティ
- **tailwind-merge** (^3.3.1) - Tailwindクラス名マージ

#### フォーム管理
- **react-hook-form** (^7.65.0) - フォーム状態管理
- **@hookform/resolvers** (^5.2.2) - フォームバリデーションリゾルバー
- **zod** (^4.1.12) - スキーマバリデーション

#### ドラッグ&ドロップ
- **@dnd-kit/core** (^6.3.1) - ドラッグ&ドロップコアライブラリ
- **@dnd-kit/sortable** (^10.0.0) - ソート可能なリスト
- **@dnd-kit/utilities** (^3.2.2) - DnD Kitユーティリティ

#### ユーティリティ
- **date-fns** (^4.1.0) - 日付操作ライブラリ

#### テスト
- **@playwright/test** (^1.56.1) - E2Eテストフレームワーク

#### 開発ツール
- **ESLint** (^9) - コードリンティング
- **eslint-config-next** (16.0.0) - Next.js ESLint設定
- **@types/node** (^20) - Node.js型定義
- **@types/react** (^19) - React型定義
- **@types/react-dom** (^19) - React DOM型定義

### インフラ
- **Docker & Docker Compose** - コンテナ化
- **Nginx** - リバースプロキシ・ロードバランサー
- **PostgreSQL** (17, pgvector拡張付き) - データベース
- **Redis** - キャッシュ・メッセージブローカー

## セットアップ

### 前提条件

このプロジェクトは **Docker Compose** を使用することを前提として設計されています。

**必須:**
- Docker Desktop または Docker Engine（20.10以上）
- Docker Compose（2.0以上、通常Docker Desktopに含まれる）

**推奨環境:**
- macOS, Linux, または Windows（WSL2推奨）
- 最低 4GB RAM
- 最低 10GB の空きディスク容量

### Docker Compose によるセットアップ

このプロジェクトは全てのサービス（フロントエンド、バックエンド、データベース、Redis、Celery、Nginx）をDocker Composeで管理します。

#### 1. 環境変数の設定

プロジェクトルートに `.env` ファイルを作成し、必要な環境変数を設定してください。

```bash
# .env ファイルの作成
nano .env
```

必要な環境変数：
- `POSTGRES_DB` - PostgreSQLデータベース名
- `POSTGRES_USER` - PostgreSQLユーザー名
- `POSTGRES_PASSWORD` - PostgreSQLパスワード
- `SECRET_KEY` - Django のシークレットキー
- `DATABASE_URL` - PostgreSQL接続URL（任意）
- `CELERY_BROKER_URL` - Redis接続URL（任意）
- その他、アプリケーションに必要な環境変数（OpenAI APIキーなど）

#### 2. 全サービスの起動

```bash
# 全てのサービス（redis, postgres, backend, celery-worker, frontend, nginx）をビルドして起動
docker-compose up --build -d
```

このコマンドで以下のサービスが起動します：
- **redis**: Redis（Celeryブローカー）
- **postgres**: PostgreSQLデータベース（17, pgvector拡張付き）
- **backend**: Django REST APIサーバー（ポート8000内部）
- **celery-worker**: Celeryワーカー（バックグラウンドタスク処理）
- **frontend**: Next.jsフロントエンド（ポート3000内部）
- **nginx**: リバースプロキシ（ポート80）

#### 3. 初回セットアップ

```bash
# データベースマイグレーションの実行
docker-compose exec backend uv run python manage.py migrate

# 管理者ユーザーの作成（初回のみ）
docker-compose exec backend uv run python manage.py createsuperuser
```

#### 4. 起動確認

全てのサービスが起動したら、以下のURLにアクセスできます：

- **フロントエンド**: http://localhost
- **バックエンドAPI**: http://localhost/api
- **管理画面**: http://localhost/admin

#### その他の便利なコマンド

```bash
# 全コンテナのステータス確認
docker-compose ps

# ログの確認（全サービス）
docker-compose logs -f

# 特定のサービスのログ確認
docker-compose logs -f backend
docker-compose logs -f celery-worker
docker-compose logs -f frontend

# コンテナの停止
docker-compose stop

# コンテナの停止と削除（ボリュームは保持）
docker-compose down

# コンテナの停止と削除（ボリュームも削除）
docker-compose down -v

# 特定のサービスの再起動
docker-compose restart backend

# 全サービスの再起動
docker-compose restart

# データベースへの接続
docker-compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB
```

## 機能詳細

### 認証機能

- ユーザー登録
- ログイン（JWT）
- トークンリフレッシュ
- ログアウト

### 動画管理

- 動画のアップロード（MP4, MOV, WEBM など）
- 自動文字起こし（Whisper API）
- 動画情報の更新・削除
- 動画一覧の取得

#### 対応ファイル形式
- 音声: `.flac`, `.m4a`, `.mp3`, `.mpga`, `.oga`, `.ogg`, `.wav`, `.webm`
- 動画: `.mp4`, `.mpeg`, `.webm`, `.mov`（ffmpegでMP3に自動変換）

### 動画グループ

- グループの作成・編集・削除
- 複数動画のグループ追加
- グループ内の動画順序変更
- 共有トークンによるグループ共有

### AIチャット

- 動画内容に関する質問
- OpenAI APIとの対話
- 文字起こしデータに基づく回答

### 共有機能

- 共有トークンの生成
- 共有リンクでの動画閲覧
- 認証なしでの共有動画アクセス

## APIエンドポイント

### 認証

- `POST /api/auth/signup/` - ユーザー登録
- `POST /api/auth/login/` - ログイン
- `POST /api/auth/logout/` - ログアウト
- `POST /api/auth/refresh/` - トークンリフレッシュ
- `GET /api/auth/me/` - 現在のユーザー情報

### 動画管理

- `GET /api/videos/` - 動画一覧取得
- `POST /api/videos/` - 動画アップロード
- `GET /api/videos/<id>/` - 動画詳細取得
- `PATCH /api/videos/<id>/` - 動画情報更新
- `DELETE /api/videos/<id>/` - 動画削除

### 動画グループ

- `GET /api/videos/groups/` - グループ一覧取得
- `POST /api/videos/groups/` - グループ作成
- `GET /api/videos/groups/<id>/` - グループ詳細取得
- `PATCH /api/videos/groups/<id>/` - グループ更新
- `DELETE /api/videos/groups/<id>/` - グループ削除
- `POST /api/videos/groups/<id>/videos/` - 動画をグループに追加
- `DELETE /api/videos/groups/<id>/videos/<video_id>/remove/` - グループから動画削除
- `POST /api/videos/groups/<id>/reorder/` - グループ内動画の順序変更
- `POST /api/videos/groups/<id>/share/` - 共有リンク作成
- `DELETE /api/videos/groups/<id>/share/delete/` - 共有リンク削除
- `GET /api/videos/groups/shared/<token>/` - 共有グループ情報取得

### チャット

- `POST /api/chat/` - チャット送信

### メディア配信

- `GET /media/<path>` - 認証されたメディアファイルの配信（JWTまたは共有トークン必要）

## 外部利用者向けAPIガイド

このセクションでは、外部クライアントからAPIを利用するための実践的な使い方をまとめます。

### 基本情報

- **ベースURL**: `http://localhost`（Docker構成の既定）
- **APIパス**: `/api`
- **認証**: `Authorization: Bearer <access_token>`（外部クライアントはBearer推奨）
- **トークン有効期限**: アクセス10分、リフレッシュ14日

環境変数例:
```bash
BASE_URL="http://localhost"
ACCESS="<JWT_ACCESS_TOKEN>"
TOKEN="<SHARE_TOKEN>"
```

### クイックスタート

#### 1. 認証（サインアップ/ログイン）

```bash
# サインアップ
curl -X POST "$BASE_URL/api/auth/signup/" \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"pass1234"}'

# ログイン（access/refresh を取得）
curl -X POST "$BASE_URL/api/auth/login/" \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"pass1234"}'
# レスポンスの access を以降の Authorization に使用

# アクセストークン再発行
curl -X POST "$BASE_URL/api/auth/refresh/" \
  -H "Content-Type: application/json" \
  -d '{"refresh":"<JWT_REFRESH_TOKEN>"}'

# 現在のユーザー情報取得
curl -H "Authorization: Bearer $ACCESS" "$BASE_URL/api/auth/me/"

# OpenAIキーを保存（暗号化保存）
curl -X PATCH "$BASE_URL/api/auth/me/" \
  -H "Authorization: Bearer $ACCESS" \
  -H "Content-Type: application/json" \
  -d '{"encrypted_openai_api_key":"sk-xxxx"}'

# ログアウト
curl -X POST "$BASE_URL/api/auth/logout/" \
  -H "Authorization: Bearer $ACCESS"
```

#### 2. 動画のアップロードと状態確認

```bash
# アップロード（multipart）
curl -X POST "$BASE_URL/api/videos/" \
  -H "Authorization: Bearer $ACCESS" \
  -F "file=@/path/to/movie.mp4" \
  -F "title=デモ動画" \
  -F "description=説明文"

# 一覧取得
curl -H "Authorization: Bearer $ACCESS" "$BASE_URL/api/videos/"

# 詳細取得（transcript/status/error_message を確認）
curl -H "Authorization: Bearer $ACCESS" "$BASE_URL/api/videos/123/"

# 更新
curl -X PATCH "$BASE_URL/api/videos/123/" \
  -H "Authorization: Bearer $ACCESS" \
  -H "Content-Type: application/json" \
  -d '{"title":"新しいタイトル"}'

# 削除
curl -X DELETE -H "Authorization: Bearer $ACCESS" \
  "$BASE_URL/api/videos/123/"
```

#### 3. 動画グループの作成と動画の追加

```bash
# グループ作成
curl -X POST "$BASE_URL/api/videos/groups/" \
  -H "Authorization: Bearer $ACCESS" \
  -H "Content-Type: application/json" \
  -d '{"name":"プロジェクトA","description":"関連動画"}'

# グループ一覧
curl -H "Authorization: Bearer $ACCESS" "$BASE_URL/api/videos/groups/"

# グループ詳細
curl -H "Authorization: Bearer $ACCESS" "$BASE_URL/api/videos/groups/10/"

# 動画をグループに追加（単体）
curl -X POST -H "Authorization: Bearer $ACCESS" \
  "$BASE_URL/api/videos/groups/10/videos/123/"

# 動画をグループに追加（複数）
curl -X POST "$BASE_URL/api/videos/groups/10/videos/" \
  -H "Authorization: Bearer $ACCESS" \
  -H "Content-Type: application/json" \
  -d '{"video_ids":[101,102,103]}'

# グループから動画削除
curl -X DELETE -H "Authorization: Bearer $ACCESS" \
  "$BASE_URL/api/videos/groups/10/videos/123/remove/"

# グループ内動画の順序変更
curl -X PATCH "$BASE_URL/api/videos/groups/10/reorder/" \
  -H "Authorization: Bearer $ACCESS" \
  -H "Content-Type: application/json" \
  -d '{"video_ids":[103,101,102]}'

# グループ更新
curl -X PATCH "$BASE_URL/api/videos/groups/10/" \
  -H "Authorization: Bearer $ACCESS" \
  -H "Content-Type: application/json" \
  -d '{"name":"新しい名称"}'

# グループ削除
curl -X DELETE -H "Authorization: Bearer $ACCESS" \
  "$BASE_URL/api/videos/groups/10/"
```

#### 4. チャット（RAG対応）

```bash
# JWT（Bearer）で利用
curl -X POST "$BASE_URL/api/chat/" \
  -H "Authorization: Bearer $ACCESS" \
  -H "Content-Type: application/json" \
  -d '{
    "group_id": 10,
    "messages": [
      {"role":"system","content":"あなたは有能なアシスタントです。"},
      {"role":"user","content":"要点を要約して"}
    ]
  }'
```

備考:
- `group_id` を渡すと、そのグループの動画に限定してベクトル検索（RAG）が実行されます。
- OpenAIのAPIキーは `/api/auth/me/` で保存してください（`encrypted_openai_api_key`）。

#### 5. 共有リンク

```bash
# 共有リンクの発行（share_token を取得）
curl -X POST -H "Authorization: Bearer $ACCESS" \
  "$BASE_URL/api/videos/groups/10/share/"

# 共有グループの参照（認証不要）
curl "$BASE_URL/api/videos/groups/shared/$TOKEN/"

# 共有トークンでチャット（body に group_id 必須）
curl -X POST "$BASE_URL/api/chat/?share_token=$TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "group_id": 10,
    "messages": [
      {"role":"user","content":"この動画群の概要は？"}
    ]
  }'

# 共有リンクの無効化
curl -X DELETE -H "Authorization: Bearer $ACCESS" \
  "$BASE_URL/api/videos/groups/10/share/delete/"
```

備考:
- 外部APIクライアントからアップロードした動画は、処理完了後にファイルが削除されるため、保護されたメディア配信によるファイル取得はできません。文字起こし結果やメタデータの取得のみが可能です。

### エラーレスポンス

代表的なエラーレスポンス:

- **400**: バリデーションエラー（例: `"video_idsは配列である必要があります"`)
- **401**: 認証エラー（例: `"無効なリフレッシュトークンです"`)
- **403**: 権限不足
- **404**: リソースなし（例: `"共有リンクが見つかりません"`、`"グループが見つかりません"`）

### 認証の使い分け

**外部クライアントからの利用時は、必ず `Authorization` ヘッダー（Bearer）を使用してください。Cookieベースの認証は使用しないでください。動画ファイルが保存されたままになる原因となります。**

- **外部クライアント**: `Authorization` ヘッダー（Bearer）**のみ**使用
- **内部ブラウザアプリ**: HttpOnly Cookie（自動リフレッシュ呼び出しが容易）

## Docker Compose構成

このプロジェクトは以下のサービスで構成されています：

- **redis**: Redis（Celeryブローカーおよび結果バックエンド）
- **postgres**: PostgreSQLデータベース（17, pgvector拡張付き）
- **backend**: Django REST APIサーバー（ポート8000内部）
- **celery-worker**: Celeryワーカー（バックグラウンドタスク処理）
- **frontend**: Next.jsフロントエンド（ポート3000内部）
- **nginx**: リバースプロキシ（ポート80）

### ボリュームマウント

- `postgres_data`: PostgreSQLデータの永続化
- `staticfiles`: Djangoの静的ファイル
- `./backend/media`: アップロードされたメディアファイル

### ネットワーク

全サービスは `ask-video-network` というDockerネットワーク内で通信します。

## データベーススキーマ

### 主要モデル

- **User**: ユーザー情報（Django AbstractUserを継承、暗号化されたOpenAI APIキーを含む）
- **Video**: 動画情報（タイトル、説明、ファイル、文字起こし、ステータス、外部アップロードフラグなど）
- **VideoGroup**: 動画グループ（名前、説明、共有トークンなど）
- **VideoGroupMember**: 動画とグループの関連付け（順序管理機能付き）
- **ChatLog**: チャットログ（質問、回答、関連動画、共有元フラグなど）

## 開発

### バックエンド（Docker環境）

このプロジェクトではPythonパッケージ管理に `uv` を使用しています。

```bash
# テストの実行
docker-compose exec backend uv run python manage.py test

# マイグレーションの作成
docker-compose exec backend uv run python manage.py makemigrations

# マイグレーションの適用
docker-compose exec backend uv run python manage.py migrate

# Djangoシェルを開く
docker-compose exec backend uv run python manage.py shell

# ログの確認（リアルタイム）
docker-compose logs -f backend celery-worker
```

**注意:** Docker環境では全てのPythonコマンドを `uv run` 経由で実行します。

### フロントエンド（Docker環境）

```bash
# フロントエンドのビルド
docker-compose exec frontend npm run build

# E2Eテストの実行
docker-compose exec frontend npm run test:e2e

# E2Eテスト（UIモード）
docker-compose exec frontend npm run test:e2e:ui

# フロントエンドのログ確認
docker-compose logs -f frontend
```

## 本番環境のデプロイ

本番環境では以下の点に注意してください：

1. **環境変数の設定**: `.env` ファイルで適切な値を設定
2. **セキュリティ**: `SECRET_KEY` を安全に管理
3. **データベース**: PostgreSQL の適切な設定
4. **メディアファイル**: ストレージの適切な設定
5. **CORS設定**: 許可するオリジンを設定
6. **SSL/TLS**: HTTPS の設定

## トラブルシューティング

### 全サービスが起動しない

1. Docker Composeのステータスを確認
```bash
docker-compose ps
```

2. ログを確認してエラーを特定
```bash
docker-compose logs
```

3. コンテナを再ビルド
```bash
docker-compose down
docker-compose up --build -d
```

### Celeryタスクが実行されない

1. Celeryワーカーのコンテナが起動しているか確認
```bash
docker-compose ps celery-worker
```

2. Celeryワーカーのログを確認
```bash
docker-compose logs celery-worker
```

3. Redisが起動しているか確認
```bash
docker-compose ps redis
# または
docker-compose exec redis redis-cli ping  # PONG が返ってくればOK
```

4. Celeryタスクの登録状況を確認
```bash
docker-compose exec backend uv run python -c "from app.celery_config import app; print(app.tasks.keys())"
```

### 文字起こしが失敗する

1. ユーザーのOpenAI APIキーが設定されているか確認
2. APIキーが有効か確認
3. 動画ファイルが存在するか確認
```bash
docker-compose exec backend uv run python manage.py shell
>>> from app.models import Video
>>> video = Video.objects.first()
>>> print(video.error_message)  # エラーメッセージを確認
```

### データベース接続エラー

1. PostgreSQLコンテナが起動しているか確認
```bash
docker-compose ps postgres
```

2. データベース接続を確認
```bash
docker-compose exec backend uv run python manage.py dbshell
```

### フロントエンドが表示されない

1. フロントエンドコンテナが起動しているか確認
```bash
docker-compose ps frontend
```

2. フロントエンドのログを確認
```bash
docker-compose logs frontend
```

3. Nginxが正常に動作しているか確認
```bash
docker-compose logs nginx
```

4. Nginxの設定を確認（`nginx.conf`）

### コンテナの再ビルドが必要な場合

```bash
# 全コンテナの停止
docker-compose down

# イメージを再ビルドして起動
docker-compose up --build -d

# マイグレーションを再適用
docker-compose exec backend uv run python manage.py migrate
```

### ボリュームの問題

データを完全にリセットしたい場合：

```bash
# 警告: このコマンドは全てのデータを削除します
docker-compose down -v
docker-compose up --build -d
docker-compose exec backend uv run python manage.py migrate
docker-compose exec backend uv run python manage.py createsuperuser
```