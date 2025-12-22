# VideoQ

動画の文字起こし（Whisper）と、文字起こし内容に対するAIチャット（RAG）を提供するWebアプリです。

## 概要

ユーザーが動画をアップロードすると、バックグラウンドで自動的に文字起こしが走り、完了後に動画（/シーン）を根拠として質問応答できます。

## 主な機能

- **認証**: HttpOnly CookieベースのJWT（メール認証・パスワードリセット対応）
- **動画アップロード**: 複数形式に対応
- **アップロード上限**: `User.video_limit` によるユーザー単位の上限（`NULL`=無制限 / `0`=禁止）
- **自動文字起こし**: Celeryで非同期実行（Whisper API）
- **AIチャット**: pgvectorを使ったRAG（OpenAI API）
- **グループ管理**: 複数動画をグループ化・並べ替え
- **共有**: 共有トークンでグループ共有（ゲスト閲覧/チャット）
- **保護されたメディア配信**: 認証/共有トークン前提で配信

## アーキテクチャ（Docker Compose）

ローカルのデフォルト構成は以下です（`docker-compose.yml`）:

- **nginx**: 入口（`80`）/ `/api` をbackendへ、それ以外をfrontendへ
- **frontend**: ViteでビルドされたReact SPA（コンテナ内 `80`）
- **backend**: Django REST API（コンテナ内 `8000`）
- **celery-worker**: 文字起こし/ベクトル化などの非同期処理
- **postgres**: PostgreSQL 17 + pgvector
- **redis**: Celery broker / result backend

## ディレクトリ構成（抜粋）

```
videoq/
├── backend/          # Django / DRF / Celery
├── frontend/         # Vite + React + React Router
├── docs/             # 設計資料（Mermaid図）
├── docker-compose.yml
└── nginx.conf
```

## 技術スタック（現状）

### Backend

- Django / Django REST Framework
- Celery + Redis
- PostgreSQL 17 + pgvector
- OpenAI API（Whisper / Chat / Embeddings）
- ストレージ: ローカル（`backend/media`）またはS3（任意）
- 依存管理: `uv`（`backend/pyproject.toml`）

### Frontend

- Vite + React + TypeScript
- React Router（SPA）
- i18n: i18next + react-i18next（`/:locale/...` のルートも提供）
- Tailwind CSS / Radix UI / react-hook-form / zod など

## 起動（Docker Compose）

### 1) 環境変数

`/.env.example` をコピーして `/.env` を作成します。

```bash
cp .env.example .env
```

重要な変数（最低限）:

- `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`
- `ENABLE_SIGNUP`
- `FRONTEND_URL`（メール内リンクに使用。デフォルトは `http://localhost`）
- `VITE_API_URL`（**frontendビルド時に使用**。デフォルトのNginx構成では `/api` 推奨）

### 2) 起動

```bash
docker compose up --build -d
```

### 3) 初回セットアップ

```bash
docker compose exec backend uv run python manage.py migrate
docker compose exec backend uv run python manage.py collectstatic
docker compose exec backend uv run python manage.py createsuperuser
```

### 4) 動作確認URL

- **Frontend**: `http://localhost`
- **Backend API**: `http://localhost/api`
- **Admin**: `http://localhost/api/admin`
- **Swagger**: `http://localhost/api/docs/`
- **ReDoc**: `http://localhost/api/redoc/`

## 重要な注意（OpenAI API Key）

このアプリは「ユーザーごとにOpenAI API Keyを設定する」前提です。

- **通常利用**: 各ユーザーが設定画面からAPI Keyを登録（DBに暗号化して保存）
- **共有リンクでのチャット**: **グループ所有者のAPI Key** を使用

関連: `docs/architecture/prompt-engineering.md`

## 開発メモ（任意）

### ローカルでフロントだけ `vite dev` を使う場合

`frontend/vite.config.ts` は `/api` を `VITE_API_URL`（未指定なら `http://localhost:8000`）へプロキシします。

### よく使うコマンド

```bash
docker compose ps
docker compose logs -f
docker compose logs -f backend celery-worker frontend nginx
docker compose down
docker compose down -v  # 全データ削除（注意）
```

