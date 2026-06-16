# VideoQ

🎥 **AIに質問するだけで、見たいシーンに瞬時にジャンプ**

VideoQは、動画を自動で文字起こしし、自然言語で動画と会話できるAI搭載の動画ナビゲーターです。

**[https://videoq.jp/](https://videoq.jp/)**

英語版: [README.md](README.md)

![VideoQ Application Screenshot](assets/screenshot.gif)

> 🔌 **API連携にも対応** — APIキー認証と OpenAI 互換 API で既存システムと連携できます。詳しくは[開発者向けAPI連携](#developer-api)をご覧ください。
>
> 📖 **設計ドキュメント** — アーキテクチャ図、ER図、シーケンス図などの詳細は[docs/](docs/README.md)を参照してください。

## ✨ できること

- **対応形式の動画をアップロード** - MP4、MOV、AVI、MKV、WebM、M4V、MPEG、3GP など
- **質問する** - 「予算について何と言っていた？」「要点をまとめて」など
- **コンテンツを検索** - 何時間もの映像をスクラブせずに特定の瞬間を見つける
- **タグで整理** - カスタムタグと色で動画を整理
- **インサイトを共有** - チームコラボレーション用の共有可能な動画グループを作成
- **多言語対応** - 日本語・英語インターフェースの切り替え

## 🚀 クイックスタート（5分）

### 必要なもの

- [Docker](https://docs.docker.com/get-docker/) と [Docker Compose](https://docs.docker.com/compose/install/) がインストール済み
- デフォルト構成で使う場合は [OpenAI APIキー](https://platform.openai.com/api-keys)
- YouTube動画を取り込む場合は [SearchAPI の APIキー](https://www.searchapi.io/)

ここでは、ローカルで VideoQ を起動して、ブラウザで使い始めるまでを順番に進めます。

### ステップ1: デフォルト構成用の OpenAI APIキーを取得

1. [OpenAI Platform](https://platform.openai.com/api-keys) にアクセス
2. サインアップまたはログイン
3. 「Create new secret key」をクリック
4. キーをコピー（`sk-...` で始まります）

デフォルト構成では、文字起こし・埋め込み・チャットに OpenAI を使用します。完全ローカル構成にする場合は、後述のローカル Whisper / Ollama 設定に切り替えてください。

### ステップ2: VideoQをセットアップ

```bash
# プロジェクトをクローンして移動
git clone https://github.com/yukiharada1228/videoq.git
cd videoq

# 設定ファイルをコピー
cp .env.example .env
```

`.env` を開き、デフォルト構成で使用する OpenAI API キーを設定してください。

```bash
OPENAI_API_KEY=sk-proj-...
```

YouTube URL から字幕を取得したい場合は、VideoQ の Settings 画面で各ユーザーが自分の `SearchAPI` キーを設定してください。

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

### 📋 先に確認：ユーザー制限の設定

VideoQ はユーザーごとに制限を管理パネルで直接設定します。

**設定場所**
1. [管理パネル](http://localhost/api/admin) にアクセス
2. `Users` を開く
3. 対象ユーザーを選ぶ
4. 以下を設定して保存

| 設定項目 | 説明 |
|----------|------|
| `Max video upload size mb` | 1本あたりのアップロード上限（MB）（デフォルト: 500） |
| `Storage limit gb` | ストレージ上限（GB）（デフォルト: 0、空欄で無制限） |
| `Processing limit minutes` | 文字起こし処理時間上限（分/月）（デフォルト: 0、空欄で無制限） |
| `Ai answers limit` | AI回答数上限（回/月）（デフォルト: 0、空欄で無制限） |

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

再起動:

```bash
docker compose restart backend celery-worker
```

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

再起動:

```bash
docker compose restart backend celery-worker
```

</details>

<details>
<summary><strong>🤖 OllamaでローカルAIチャット（無料のChatGPT代替）</strong></summary>

**Ollamaをインストール:**
1. [ollama.com](https://ollama.com) からダウンロード
2. インストールして実行

**モデルを取得:**

```bash
ollama pull qwen3:0.6b
```

**VideoQを設定:**

`.env` ファイルを編集：

```bash
LLM_PROVIDER=ollama
LLM_MODEL=qwen3:0.6b
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

再起動:

```bash
docker compose restart backend celery-worker
```

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

再起動:

```bash
docker compose restart backend celery-worker
```

**重要:** OpenAIからローカル埋め込みに切り替える場合、管理パネルで既存の動画を再インデックスする必要があります。

</details>

</details>

<a id="developer-api"></a>

## 🔌 開発者向けAPI連携

VideoQ は連携用 API キー認証に対応しており、既存システムやバッチからサーバー間通信で利用できます。

Settings 画面の「連携用APIキー」から `vq_...` 形式のキーを発行し、REST API では `X-API-Key` ヘッダー、OpenAI 互換 API では `Authorization: Bearer <vq_...>` で認証します。連携手順・認証・エンドポイント別サンプルコード（cURL / JavaScript / TypeScript / Python / Go / Java / C# / PHP / Ruby）は、アプリ内の開発者Docsを参照してください。

- **開発者Docs:** [http://localhost/docs](http://localhost/docs)
- **OpenAPI (Swagger UI):** [http://localhost/api/docs/](http://localhost/api/docs/)
- **ReDoc:** [http://localhost/api/redoc/](http://localhost/api/redoc/)

## 🧠 MCP（Model Context Protocol）連携

VideoQ は **分析専用** のリモート MCP サーバーをバックエンドに内蔵しており、`POST /api/mcp/` で公開しています。Streamable HTTP に対応した MCP クライアント（Claude Code / Cursor / `mcp-remote` 経由の Claude Desktop など）から、URL と API キーだけで接続できます。ローカルプロセスのインストールは不要です。

> 🛡️ **設計方針:** RAG チャット送信（質問の投げ込み）は意図的に含めていません。MCP 経由ではあくまで **既存データの分析・参照** のみを行います。

### 公開ツール一覧

| ツール | 用途 |
|---|---|
| `list_videos` / `get_video` | 動画一覧・詳細（文字起こし含む） |
| `list_groups` / `get_group` | グループ一覧・メンバー動画 |
| `list_tags` | タグ一覧 |
| `get_chat_history` | グループのチャット履歴（フィードバック付き） |
| `get_chat_analytics` | 質問総数・期間・日別時系列・フィードバック集計 |
| `get_chat_analytics_keywords` | 質問のキーワード頻度 |
| `get_evaluation_summary` | RAGAS 平均スコア（faithfulness / answer_relevancy / context_precision） |
| `list_evaluation_logs` | RAGAS ログ別スコア |

一覧系ツールは `limit` / `offset` のページングに対応しています（デフォルト 20、上限 100）。

### セットアップ手順

#### ステップ1: 連携用 API キーを発行

VideoQ にログインし、**Settings → 連携用APIキー** から `vq_...` 形式のキーを発行してコピーします。

#### ステップ2: MCP クライアントにエンドポイントを登録

エンドポイント URL は VideoQ のホスト名に `/api/mcp/` を付けたものです（ローカル Docker なら `http://localhost/api/mcp/`、本番なら `https://your-domain.example.com/api/mcp/`）。認証は `Authorization: Bearer vq_...` ヘッダ（または同等の `X-API-Key` ヘッダ）で行います。

**Claude Code** の場合:

```bash
claude mcp add --transport http videoq https://your-domain.example.com/api/mcp/ \
  --header "Authorization: Bearer vq_xxxxxxxxxxxxxxxx"
```

**Claude Desktop / claude.ai のビルトインコネクタ（OAuth 2.1）** の場合は、Settings → Connectors → Add custom connector に MCP URL を貼り付け、同意画面で「Authorize」を押すだけで接続できます。API キーは不要です。VideoQ は MCP Authorization 仕様準拠の OAuth 2.1 + Dynamic Client Registration (RFC 7591) を実装しており、クライアントが自動でクライアント登録 → 認可コード（PKCE）→ アクセストークン取得を行います。

```
https://your-domain.example.com/api/mcp/
```

裏側では `/.well-known/oauth-protected-resource/api/mcp` と `/.well-known/oauth-authorization-server` を通じて認可サーバーを自動検出し、`/api/oauth/register/` に動的にクライアント登録、`/api/oauth/authorize/`（PKCE 必須）→ `/api/oauth/token/` の順で標準フローを完了します。発行されたトークンは **Settings → Connected Apps** からいつでも失効できます。

旧来のクライアントで `mcp-remote` ブリッジを使う場合は、API キー方式で `claude_desktop_config.json` に以下を追記してください。

```json
{
  "mcpServers": {
    "videoq": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://your-domain.example.com/api/mcp/",
        "--header",
        "Authorization: Bearer vq_xxxxxxxxxxxxxxxx"
      ]
    }
  }
}
```

設定ファイルの場所:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

**Cursor** など Streamable HTTP に対応した他クライアントも、同じ URL + ヘッダの組で登録できます。

#### ステップ3: 動作確認

クライアントを再起動し、MCP サーバーが `videoq` として認識されているか確認します。試しに「グループ 1 の RAGAS 評価サマリを見せて」「直近の質問キーワードを教えて」のように尋ねれば、対応するツールが呼ばれます。

### トラブルシューティング

- **`401 Unauthorized`** → API キー（または OAuth トークン）が渡っていない、または失効しています。Settings で再発行 / 再連携し、ヘッダ値を更新してください。
- **`404 Not Found`** → URL が誤っています。ホスト名と `/api/mcp/`（末尾スラッシュは任意）を再確認してください。
- **OAuth コネクタが認可サーバーを検出できない** → `https://<host>/.well-known/oauth-authorization-server` と `https://<host>/.well-known/oauth-protected-resource/api/mcp` が JSON を返すか確認してください。これらは API ホストのルートで公開する必要があるため、nginx / リバースプロキシ側で `/.well-known/oauth-*` をバックエンドへフォワードしてください。

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
