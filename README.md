# VideoQ

🎥 **AIに質問するだけで、見たいシーンに瞬時にジャンプ**

VideoQは、動画を自動で文字起こしし、自然言語で動画と会話できるAI搭載の動画ナビゲーターです。

## 開発者向けAPI連携

VideoQ は API キー認証に対応しており、既存システムやバッチからサーバー間通信で利用できます。  
連携手順・認証・エンドポイント別サンプルコード（cURL / JavaScript / TypeScript / Python / Go / Java / C# / PHP / Ruby）は、アプリ内の開発者Docsを参照してください。

- **開発者Docs:** [http://localhost/docs](http://localhost/docs)
- **OpenAPI (Swagger UI):** [http://localhost/api/docs/](http://localhost/api/docs/)
- **ReDoc:** [http://localhost/api/redoc/](http://localhost/api/redoc/)

### MCP サーバー

VideoQ には、既存の API キー認証付き REST API をそのまま利用する軽量 MCP サーバーも含められます。`mcp/videoq_mcp_server.py` は stdio で動作し、以下のツールを提供します。

- `list_videos`
- `get_video`
- `list_groups`
- `get_group`
- `list_tags`
- `search_related_scenes`
- `ask_videoq`
- `get_chat_history`

事前に VideoQ 側で API キーを作成し、環境変数を設定してください。

```bash
export VIDEOQ_BASE_URL=http://localhost/api
export VIDEOQ_API_KEY=vq_xxx
python mcp/videoq_mcp_server.py
```

`VIDEOQ_BASE_URL` は `http://localhost` のような値でも構いません。`/api` がなければ自動補完されます。

`uv` を使う場合は `mcp` ディレクトリで次でも起動できます。

```bash
cd mcp
uv run videoq-mcp
```

Claude Desktop / Codex CLI などの stdio MCP クライアントでは、たとえば次のように登録できます。

```json
{
  "mcpServers": {
    "videoq": {
      "command": "uv",
      "args": ["run", "videoq-mcp"],
      "cwd": "/absolute/path/to/videoq/mcp",
      "env": {
        "VIDEOQ_BASE_URL": "http://localhost/api",
        "VIDEOQ_API_KEY": "vq_xxx"
      }
    }
  }
}
```

以下の手順でローカル環境にセットアップできます。

![VideoQ Application Screenshot](assets/screenshot.gif)

## ✨ できること

- **あらゆる動画をアップロード** - MP4、MOV、AVI など
- **質問する** - 「予算について何と言っていた？」「要点をまとめて」など
- **コンテンツを検索** - 何時間もの映像をスクラブせずに特定の瞬間を見つける
- **タグで整理** - カスタムタグと色で動画を整理
- **インサイトを共有** - チームコラボレーション用の共有可能な動画グループを作成
- **ショート動画** - AIの回答で頻繁に参照される人気シーンをTikTokのようにスワイプ閲覧
- **多言語対応** - 日本語・英語インターフェースの切り替え

## 🚀 クイックスタート（5分）

### 必要なもの

- [Docker](https://docs.docker.com/get-docker/) と [Docker Compose](https://docs.docker.com/compose/install/) がインストール済み
- [OpenAI APIキー](https://platform.openai.com/api-keys)

ここでは、ローカルで VideoQ を起動して、ブラウザで使い始めるまでを順番に進めます。

### ステップ1: OpenAI APIキーを取得

1. [OpenAI Platform](https://platform.openai.com/api-keys) にアクセス
2. サインアップまたはログイン
3. 「Create new secret key」をクリック
4. キーをコピー（`sk-...` で始まります）

### ステップ2: VideoQをセットアップ

```bash
# プロジェクトをクローンして移動
git clone https://github.com/yukiharada1228/videoq.git
cd videoq

# 設定ファイルをコピー
cp .env.example .env
```

`.env` ファイルを開いて、最低限次の2つを設定します。

```bash
# SECRET_KEYを生成して設定（必須）
docker compose run --rm backend python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"

# .env に設定する値
SECRET_KEY=ここに生成した値
OPENAI_API_KEY=sk-your-key-here
```

### ステップ3: VideoQを起動

```bash
# 全サービスを起動（初回は数分かかることがあります）
docker compose up --build -d

# 初期セットアップ
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py collectstatic --noinput
docker compose exec backend python manage.py createsuperuser
```

### ステップ4: VideoQを使い始める！

ブラウザで [http://localhost](http://localhost) を開けば準備完了です！

**便利なリンク:**
- **管理パネル:** [http://localhost/api/admin](http://localhost/api/admin) （ユーザー、動画の管理）
- **API ドキュメント:** [http://localhost/api/docs/](http://localhost/api/docs/) （開発者向け）

**最初にやること:**
1. 作成した管理者アカウントでログイン
2. 必要なら一般ユーザーを作成
3. 一般ユーザーには動画アップロード上限を設定
4. 動画をアップロードして、文字起こし完了後にチャットを試す

### 📋 先に確認：ユーザーのアップロード上限

新規ユーザーは、作成しただけでは動画をアップロードできません。  
初期値が `video_limit=0` になっているため、管理者がアップロード可能本数を設定してから使い始めてください。

**設定場所**
1. [管理パネル](http://localhost/api/admin) にアクセス
2. `Users` を開く
3. 対象ユーザーを選ぶ
4. `Video limit` を設定して保存

**`Video limit` の意味**
1. `0`: アップロード不可（初期値）
2. 正の数: その本数までアップロード可能
3. 空欄: 無制限

この設定をしておくと、一般ユーザーがすぐに動画をアップロードして使い始められます。

<details>
<summary><strong>📦 オプション：クラウドストレージの設定 (AWS S3 / Cloudflare R2)</strong></summary>

**※このステップは必須ではありません。** デフォルトではローカルのファイルシステムに動画を保存しますが、AWS S3やCloudflare R2などのオブジェクトストレージを使用することも可能です。

`.env` ファイルで以下を設定：
```bash
USE_S3_STORAGE=true
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_STORAGE_BUCKET_NAME=your-bucket

# AWS S3 の場合
AWS_S3_REGION_NAME=ap-northeast-1

# Cloudflare R2 の場合
AWS_S3_ENDPOINT_URL=https://<account-id>.r2.cloudflarestorage.com
AWS_S3_REGION_NAME=auto
```

再起動: `docker compose restart backend celery-worker`

</details>

<details>
<summary><strong>💰 オプション：ローカルAIでコストを節約</strong></summary>

**※このステップは必須ではありません。** デフォルトのOpenAI設定で問題ない場合は、スキップして構いません。

コストを抑えたい場合や、プライバシーを重視して完全オフラインで動かしたい場合のみ、以下の手順で無料のローカルAIモデルに切り替えることができます。

<details>
<summary><strong>🖥️ ローカルWhisper（無料の文字起こし）</strong></summary>

コンピューターのGPUを使用して、より高速で無料の文字起こしを実現。

**クイックセットアップ:**

```bash
# 1. whisper.cppを取得（VideoQルートディレクトリから）
git submodule update --init --recursive
cd whisper.cpp

# 2. ビルド
cmake -B build
cmake --build build -j --config Release

# 3. モデルをダウンロード
bash ./models/download-ggml-model.sh large-v3-turbo

# 4. サーバーを起動
./build/bin/whisper-server -m models/ggml-large-v3-turbo.bin --inference-path /audio/transcriptions -l ja
```

**VideoQを設定:**

`.env` ファイルを編集：
```bash
WHISPER_BACKEND=whisper.cpp
WHISPER_LOCAL_URL=http://host.docker.internal:8080
```

再起動: `docker compose restart backend celery-worker`

</details>

<details>
<summary><strong>🤖 OllamaでローカルAIチャット（無料のChatGPT代替）</strong></summary>

**Ollamaをインストール:**
1. [ollama.com](https://ollama.com) からダウンロード
2. インストールして実行

**モデルを取得:**
```bash
ollama pull qwen3:0.6b  # 小さく高速なモデル
# または
ollama pull llama3:8b   # より大きく高性能なモデル
```

**VideoQを設定:**

`.env` ファイルを編集：
```bash
LLM_PROVIDER=ollama
LLM_MODEL=qwen3:0.6b
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

再起動: `docker compose restart backend celery-worker`

</details>

<details>
<summary><strong>🔍 ローカル埋め込み（無料のテキスト検索）</strong></summary>

**埋め込みモデルを取得:**
```bash
ollama pull qwen3-embedding:0.6b
```

**VideoQを設定:**

`.env` ファイルを編集：
```bash
EMBEDDING_PROVIDER=ollama
EMBEDDING_MODEL=qwen3-embedding:0.6b
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

再起動: `docker compose restart backend celery-worker`

**重要:** OpenAIからローカル埋め込みに切り替える場合、管理パネルで既存の動画を再インデックスする必要があります。

</details>

</details>

## 🤝 貢献

バグを見つけた？機能を追加したい？貢献を歓迎します！

1. リポジトリをフォーク
2. 機能ブランチを作成
3. 変更を加える
4. 必要に応じてテストを追加
5. プルリクエストを送信

## 📚 引用

- 藤吉 弘亘. "AIと共に生きる時代における教育への生成 AI 活用：「藤吉 AI先生」". 情報処理学会 会誌「情報処理」 Vol.66, No.11 (2025).
  - [https://ipsj.ixsq.nii.ac.jp/records/2004788](https://ipsj.ixsq.nii.ac.jp/records/2004788)

## 📄 ライセンス

詳細は [LICENSE](LICENSE) ファイルをご覧ください。
