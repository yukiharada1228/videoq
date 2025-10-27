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

- POST `/api/auth/register/` でユーザー登録
- PUT `/api/auth/api-key/` でOpenAI APIキーを設定（暗号化して保存）

### 2. 動画のアップロード

```bash
POST /api/video/videos/
{
  "file": <video_file>,
  "title": "動画タイトル",
  "description": "説明"
}
```

動画をアップロードすると、自動的に文字起こし処理が開始されます。

**対応ファイル形式:**
- 音声: `.flac`, `.m4a`, `.mp3`, `.mpga`, `.oga`, `.ogg`, `.wav`, `.webm`
- 動画: `.mp4`, `.mpeg`, `.webm`
- **その他の形式（MOVなど）**: ffmpegでMP3に自動変換されます
処理状況は `status` フィールドで確認できます：
- `pending`: 処理待ち
- `processing`: 処理中
- `completed`: 完了
- `error`: エラー

### 3. 文字起こし結果の確認

```bash
GET /api/video/videos/{id}/
```

`transcript` フィールドに文字起こし結果が格納されます。

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
│   ├── video/
│   │   ├── serializers.py  # シリアライザー
│   │   └── views.py        # ビュー
│   └── ...
├── ask_video/
│   ├── settings.py      # Django設定（Celery設定含む）
│   └── ...
└── pyproject.toml        # 依存関係
```

## トラブルシューティング

### Celeryワーカーがタスクを受け取らない

1. Redisが起動しているか確認
2. Celeryワーカーが正常に起動しているか確認
3. ログでエラーがないか確認

### 文字起こしタスクが失敗する

1. ユーザーのOpenAI APIキーが設定されているか確認
2. APIキーが有効か確認
3. 動画ファイルが存在するか確認
4. `error_message` フィールドで詳細を確認

