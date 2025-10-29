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
├── backend/          # Django REST Framework バックエンド
│   ├── app/          # メインアプリケーション
│   │   ├── auth/     # 認証機能
│   │   ├── video/   # 動画管理機能
│   │   ├── chat/     # チャット機能
│   │   └── utils/    # ユーティリティ
│   ├── ask_video/    # Djangoプロジェクト設定
│   ├── media/        # アップロードされたメディアファイル
│   └── README.md     # バックエンドREADME
├── frontend/         # Next.js + TypeScript フロントエンド
│   ├── app/          # Next.js App Router
│   ├── components/   # Reactコンポーネント
│   ├── hooks/        # カスタムフック
│   └── README.md     # フロントエンドREADME
├── docker-compose.yml # Docker Compose設定
├── nginx.conf        # Nginx設定
└── README.md         # このファイル
```

## 使用技術

### バックエンド
- **Django 5.2.7** - Webフレームワーク
- **Django REST Framework** - REST API構築
- **JWT認証** (django-rest-framework-simplejwt) - 認証システム
- **Celery** - バックグラウンドタスク処理
- **Redis** - Celeryブローカー・キュー管理
- **PostgreSQL** - データベース
- **pgvector** - ベクトルデータベース機能
- **uv** - 高速なPythonパッケージマネージャー
- **Whisper API** (OpenAI) - 音声文字起こし
- **OpenAI API** - チャット機能
- **ffmpeg** - 動画変換

### フロントエンド
- **Next.js 16** - React フレームワーク
- **TypeScript** - 型安全性
- **Tailwind CSS** - UIスタイリング
- **shadcn/ui** - UIコンポーネント
- **Playwright** - E2Eテスト

### インフラ
- **Docker & Docker Compose** - コンテナ化
- **Nginx** - リバースプロキシ
- **Gunicorn** - WSGIサーバー

## セットアップ

### 前提条件

このプロジェクトのバックエンドは **Docker Compose** を使用することを前提として設計されています。

**必須:**
- Docker Desktop または Docker Engine（20.10以上）
- Docker Compose（2.0以上、通常Docker Desktopに含まれる）
- フロントエンドをローカルで開発する場合: Node.js 18以上とnpm

**推奨環境:**
- macOS, Linux, または Windows（WSL2推奨）
- 最低 4GB RAM
- 最低 10GB の空きディスク容量

### Docker Compose によるセットアップ

**バックエンドは Docker Compose を使用することを前提としています。**

#### 1. 環境変数の設定

```bash
# .env ファイルの作成
cp .env.example .env

# 必要な環境変数を設定
nano .env
```

必要な環境変数：
- `POSTGRES_DB` - PostgreSQLデータベース名
- `POSTGRES_USER` - PostgreSQLユーザー名
- `POSTGRES_PASSWORD` - PostgreSQLパスワード
- `SECRET_KEY` - Django のシークレットキー
- `DATABASE_URL` - PostgreSQL接続URL（任意）
- `CELERY_BROKER_URL` - Redis接続URL（任意）

#### 2. コンテナのビルドと起動

```bash
# バックエンド関連コンテナの起動
docker-compose up -d postgres redis

# バックエンドサービスのビルドと起動
docker-compose up --build -d backend celery-worker

# 初回マイグレーション
docker-compose exec backend uv run python manage.py migrate

# 管理者ユーザーの作成（初回のみ）
docker-compose exec backend uv run python manage.py createsuperuser

# Nginxの起動
docker-compose up -d nginx
```

#### 3. 起動確認

- バックエンドAPI: http://localhost:80/api
- 管理画面: http://localhost:80/admin
- フロントエンド: http://localhost:80（フロントエンド起動後）

#### その他の便利なコマンド

```bash
# 全コンテナの起動
docker-compose up -d

# ログの確認
docker-compose logs -f backend
docker-compose logs -f celery-worker

# コンテナの停止
docker-compose stop

# コンテナの再起動
docker-compose restart backend

# データベースへの接続
docker-compose exec postgres psql -U postgres -d postgres
```

### フロントエンドのセットアップ（開発環境）

```bash
cd frontend

# 依存関係のインストール
npm install

# 環境変数の設定
echo "NEXT_PUBLIC_API_URL=http://localhost:80/api" > .env.local

# 開発サーバーの起動
npm run dev
```

フロントエンドは http://localhost:3000 で起動します（開発時は別ポートで起動）。

詳細は `frontend/README.md` を参照してください。

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

## Docker Compose構成

このプロジェクトは以下のサービスで構成されています：

- **postgres**: PostgreSQLデータベース（pgvector拡張付き）
- **redis**: Redis（Celeryブローカーおよび結果バックエンド）
- **backend**: Django REST APIサーバー
- **celery-worker**: Celeryワーカー（バックグラウンドタスク処理）
- **nginx**: リバースプロキシ（ポート80）

### ボリュームマウント

- `postgres_data`: PostgreSQLデータの永続化
- `staticfiles`: Djangoの静的ファイル
- `./backend/media`: アップロードされたメディアファイル

### ネットワーク

全サービスは `ask-video-network` というDockerネットワーク内で通信します。

## データベーススキーマ

### 主要モデル

- **User**: ユーザー情報（暗号化されたOpenAI APIキーを含む）
- **Video**: 動画情報（タイトル、説明、文字起こし、ステータスなど）
- **VideoGroup**: 動画グループ（名前、説明、共有トークンなど）
- **VideoGroupMember**: 動画とグループの関連付け

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

### フロントエンド

```bash
# ビルド
npm run build

# E2Eテストの実行
npm run test:e2e

# E2Eテスト（UIモード）
npm run test:e2e:ui
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

### Celeryタスクが実行されない

1. Celeryワーカーのコンテナが起動しているか確認
```bash
docker-compose ps
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
docker-compose exec backend uv run python -c "from ask_video.celery import app; print(app.tasks.keys())"
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

### コンテナの再ビルドが必要な場合

```bash
# 全コンテナの停止
docker-compose down

# イメージを再ビルドして起動
docker-compose up --build -d

# マイグレーションを再適用
docker-compose exec backend uv run python manage.py migrate
```

## ライセンス

このプロジェクトは MIT ライセンスのもとで公開されています。
