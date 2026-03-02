# VideoQ

🎥 **AIに質問するだけで、見たいシーンに瞬時にジャンプ**

VideoQは、動画を自動で文字起こしし、自然言語で動画と会話できるAI搭載の動画ナビゲーターです。

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
- [OpenAI APIキー](https://platform.openai.com/api-keys)（取得方法をご説明します）

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

`.env` ファイルを編集して必要なキーを設定：

```bash
# SECRET_KEYを生成して設定（必須）
docker compose run --rm backend python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"

# 生成された値を .env に設定
SECRET_KEY=生成された値をここに貼り付け

# OpenAI APIキーを設定
OPENAI_API_KEY=sk-your-key-here
```

### ステップ3: VideoQを起動

```bash
# 全サービスを開始（初回は数分かかる場合があります）
docker compose up --build -d

# データベースをセットアップ
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py collectstatic --noinput

# 管理者アカウントを作成
docker compose exec backend python manage.py createsuperuser
```

### ステップ4: VideoQを使い始める！

ブラウザで [http://localhost](http://localhost) を開けば準備完了です！

**その他の便利なリンク:**
- **管理パネル:** [http://localhost/api/admin](http://localhost/api/admin) （ユーザー、動画の管理）
- **API ドキュメント:** [http://localhost/api/docs/](http://localhost/api/docs/) （開発者向け）

### 📋 ユーザー管理

**重要:** 新規ユーザーは動画アップロード制限が0（アップロード不可）で作成されます。管理者として、管理パネルを通じてユーザーに適切な動画制限を設定する必要があります。

**動画制限を設定するには:**
1. [管理パネル](http://localhost/api/admin) にアクセス
2. 「Users」をクリック
3. 編集するユーザーを選択
4. 「Video limit」フィールドを設定：
   - `0` = アップロード不可（新規ユーザーのデフォルト）
   - 任意の正の数 = ユーザーがアップロードできる最大動画数
   - 空白 = 無制限アップロード

この設計により、管理者がリソース使用量とユーザー権限を完全に制御できます。

### 🔌 オプション： 既存システムとのAPI連携

VideoQ では、既存の社内システム、外部の業務システム、定期実行バッチなどから API を呼び出すために、連携用の API キーを発行できます。  
この API キーを使うと、ブラウザでログインしなくても、サーバー間通信で VideoQ の API にアクセスできます。

**まず理解しておくこと:**
1. API キーは、発行したユーザーの権限で動作します
2. API キーは、設定画面で一度だけ平文表示されます
3. 生成後は同じキーを再表示できないため、必ず安全な場所に保存してください
4. 外部システムのバックエンドやバッチ処理で使うことを想定しています

**どんなときに使うか:**
1. 社内システムから動画一覧を取得したい
2. 別システムから動画をアップロードしたい
3. 外部バッチからチャット履歴や分析結果を取得したい
4. 自社システムから RAG チャットを実行したい

**API キーの発行手順:**
1. VideoQ にログインします
2. [http://localhost/settings](http://localhost/settings) を開きます
3. 「連携用APIキー」の `新しいシークレットキーを作成` を押します
4. キー名を入力します
5. 権限を選びます
6. `シークレットキーを作成` を押します
7. 表示されたキーをコピーして、安全な場所に保存します

**権限の違い:**
1. `All`
   読み取り、作成、更新、削除を含む通常の API 操作ができます
2. `Read only`
   読み取り系 API に加えて、`POST /api/chat/` によるチャット実行のみ許可されます  
   動画・タグ・グループの作成や更新はできません

**認証ヘッダー:**
1. もっとも分かりやすい方法
   `X-API-Key: 発行したキー`
2. もう一つの指定方法
   `Authorization: ApiKey 発行したキー`

**最初にやる疎通確認:**
以下で、キーが正しく使えるか確認できます。

```bash
curl -H "X-API-Key: vq_your_key_here" \
  http://localhost/api/auth/me/
```

`200 OK` でユーザー情報が返れば、認証は成功です。

**よく使う curl 例:**

現在のユーザー情報を取得:
```bash
curl -H "X-API-Key: vq_your_key_here" \
  http://localhost/api/auth/me/
```

動画一覧を取得:
```bash
curl -H "X-API-Key: vq_your_key_here" \
  http://localhost/api/videos/
```

チャットグループ一覧を取得:
```bash
curl -H "X-API-Key: vq_your_key_here" \
  http://localhost/api/videos/groups/
```

チャット分析を取得:
```bash
curl -H "X-API-Key: vq_your_key_here" \
  "http://localhost/api/chat/analytics/?group_id=6"
```

チャットグループを作成 (`All` のみ):
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: vq_your_key_here" \
  -d '{"name":"External Integration Group","description":"created from external system"}' \
  http://localhost/api/videos/groups/
```

RAG チャットを実行 (`All` と `Read only` のどちらでも可):
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-API-Key: vq_your_key_here" \
  -d '{"group_id":6,"messages":[{"role":"user","content":"この動画の要点を教えてください。"}]}' \
  http://localhost/api/chat/
```

動画をアップロード (`All` のみ):
```bash
curl -X POST \
  -H "X-API-Key: vq_your_key_here" \
  -F "title=Uploaded from external system" \
  -F "description=uploaded by integration" \
  -F "file=@/path/to/video.mp4;type=video/mp4" \
  http://localhost/api/videos/
```

**レスポンスの見方:**
1. 作成系 API は、作成したリソースの `id` を含む JSON を返します
2. 返ってきた `id` は、そのまま次の更新・削除・詳細取得に使えます
3. チャット API は `chat_log_id` を返すため、履歴やフィードバックに使えます

**動画アップロード時の注意:**
1. `curl` でアップロードするときは、ファイルの Content-Type を `video/mp4` など正しい動画 MIME type にしてください
2. `application/octet-stream` のままだと、動画ではないファイルとしてバリデーションエラーになります

**外部システム実装時のおすすめ:**
1. まず `GET /api/auth/me/` で認証確認
2. 次に、実際に使う API を 1 本ずつ `curl` で確認
3. 問題なければ、外部システム側に組み込み
4. 運用時は、API キーを環境変数やシークレットマネージャーで管理


## 📦 オプション：クラウドストレージの設定 (AWS S3 / Cloudflare R2)

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

## 💰 オプション：ローカルAIでコストを節約

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
