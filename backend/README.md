# Ask Video Backend

動画の文字起こしとチャット機能を提供するDjango REST APIアプリケーション

## 機能

- ユーザー認証（JWT）
- 動画のアップロード
- Whisper APIを使用した文字起こし（Celeryによるバックグラウンド処理）
- 動画グループ管理
- ChatGPTとの対話

## セットアップ

### 1. 依存関係のインストール

```bash
uv sync
```

### 1.5. ffmpegのインストール

MOVなどWhisper APIがサポートしていない形式のファイルは自動的にMP3に変換されます。
ffmpegがインストールされている必要があります。

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install ffmpeg

# macOS
brew install ffmpeg

# Windows
# https://ffmpeg.org/download.html からダウンロードしてインストール
```

### 2. データベースマイグレーション

```bash
python manage.py migrate
```

### 3. Redisの起動

Celeryを使用するため、Redisが必要です。

```bash
# Dockerを使用する場合
docker run -d -p 6379:6379 redis:latest

# または、ローカルにRedisがインストールされている場合
redis-server
```

### 4. Celeryワーカーの起動

```bash
# ターミナル1でCeleryワーカーを起動
celery -A ask_video worker --loglevel=info

# ターミナル2でDjango開発サーバーを起動
python manage.py runserver
```

**uvを使っている場合:**
```bash
uv run celery -A ask_video worker --loglevel=info
```

**注意:** このプロジェクトはDocker Composeを使用することを前提として設計されています。ローカル開発環境でのセットアップは、プロジェクトルートのREADME.mdを参照してください。

## トラブルシューティング

### Celeryタスクが実行されない場合

1. **Celeryワーカーが起動しているか確認**
```bash
ps aux | grep celery
```

2. **登録されているタスクを確認**
```bash
uv run celery -A ask_video inspect registered
```

3. **正しいCeleryワーカーを起動**
古い設定（`-A config`）ではなく、新しい設定（`-A ask_video`）で起動してください。

4. **ログを確認**
```bash
# Celeryワーカーのログでエラーを確認
uv run celery -A ask_video worker --loglevel=debug
```

## 使用方法

### 1. ユーザー登録とAPIキー設定

- POST `/api/auth/signup/` でユーザー登録（メール認証が必要）
- POST `/api/auth/verify-email/` でメール認証
- PATCH `/api/auth/me/` でOpenAI APIキーを設定（暗号化して保存、`encrypted_openai_api_key` フィールド）

### 2. 動画のアップロード

```bash
POST /api/videos/
{
  "file": <video_file>,
  "title": "動画タイトル",
  "description": "説明"
}
```

動画をアップロードすると、自動的に文字起こし処理が開始されます。

**対応ファイル形式:**
- 音声: `.flac`, `.m4a`, `.mp3`, `.mpga`, `.oga`, `.ogg`, `.wav`, `.webm`
- 動画: `.mp4`, `.mpeg`, `.webm`, `.mov`（ffmpegでMP3に自動変換）
- **その他の形式（MOVなど）**: ffmpegでMP3に自動変換されます

処理状況は `status` フィールドで確認できます：
- `pending`: 処理待ち
- `processing`: 処理中
- `completed`: 完了
- `error`: エラー

### 3. 文字起こし結果の確認

```bash
GET /api/videos/{id}/
```

`transcript` フィールドに文字起こし結果が格納されます。

### 4. 動画グループ管理

```bash
# グループ作成
POST /api/videos/groups/
{
  "name": "グループ名",
  "description": "説明"
}

# 動画をグループに追加
POST /api/videos/groups/{group_id}/videos/
{
  "video_ids": [1, 2, 3]
}
```

### 5. チャット機能

```bash
# チャット送信（RAG対応）
POST /api/chat/
{
  "group_id": 10,
  "messages": [
    {"role": "user", "content": "質問内容"}
  ]
}

# チャット履歴取得
GET /api/chat/history/?group_id=10
```

## Celery設定

### 環境変数

以下の環境変数でCeleryの設定を変更できます：

```bash
# Redis接続URL
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0

# タイムアウト設定
CELERY_TASK_TIME_LIMIT=1800  # 30分
CELERY_TASK_SOFT_TIME_LIMIT=1500  # 25分
```

### 本番環境

本番環境では、Redisを別サーバーで起動し、適切な接続URLを設定してください。

```python
# settings.py
CELERY_BROKER_URL = os.environ.get(
    "CELERY_BROKER_URL", "redis://your-redis-server:6379/0"
)
CELERY_RESULT_BACKEND = os.environ.get(
    "CELERY_RESULT_BACKEND", "redis://your-redis-server:6379/0"
)
```

## ディレクトリ構造

```
backend/
├── app/
│   ├── tasks.py          # Celeryタスク（文字起こし処理）
│   ├── celery_config.py  # Celeryアプリ設定
│   ├── models.py         # データモデル
│   ├── auth/             # 認証機能（views, serializers, urls, tests）
│   ├── video/            # 動画管理機能（views, serializers, urls, tests）
│   ├── chat/             # チャット機能（views, serializers, urls, services）
│   ├── common/           # 共通機能（authentication, permissions, responses）
│   ├── media/            # メディア配信機能（views）
│   ├── scene_otsu/       # シーン分割機能
│   ├── utils/            # ユーティリティ（encryption, vector_manager, task_helpers, email等）
│   └── migrations/       # データベースマイグレーション
├── ask_video/
│   ├── settings.py      # Django設定（Celery設定含む）
│   ├── urls.py          # URL設定
│   ├── wsgi.py          # WSGI設定
│   └── asgi.py          # ASGI設定
├── media/               # アップロードされたメディアファイル
├── pyproject.toml        # Python依存関係（uv）
├── uv.lock              # uv依存関係ロックファイル
├── manage.py            # Django管理スクリプト
└── Dockerfile           # バックエンドDockerイメージ
```

## トラブルシューティング

### Celeryワーカーがタスクを受け取らない

1. Redisが起動しているか確認
2. Celeryワーカーが正常に起動しているか確認
3. ログでエラーがないか確認

### 文字起こしタスクが失敗する

1. ユーザーのOpenAI APIキーが設定されているか確認（`/api/auth/me/` で `encrypted_openai_api_key` を確認）
2. APIキーが有効か確認
3. 動画ファイルが存在するか確認
4. `error_message` フィールドで詳細を確認

### Docker環境での開発

このプロジェクトはDocker Composeを使用することを前提としています。詳細はプロジェクトルートのREADME.mdを参照してください。

```bash
# Docker環境でのコマンド実行例
docker-compose exec backend uv run python manage.py migrate
docker-compose exec backend uv run python manage.py shell
docker-compose exec backend uv run celery -A ask_video worker --loglevel=info
```

