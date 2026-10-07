# apps/worker

VideoQ の非同期ジョブを処理する Python worker です。ローカルでは SQS long poll、
本番では AWS Lambda の SQS trigger で実行します。

## ジョブ契約

API は次の native JSON を SQS へ送信します。

```json
{
  "type": "transcribe_video",
  "job_id": "uuid",
  "payload": { "video_id": 123 }
}
```

対応する処理:

| type | 処理 |
|---|---|
| `transcribe_video` | FFmpeg / Whisper / YouTube 文字起こしとシーン分割 |
| `index_video_transcript` | embedding生成と検索用シーンの一括更新（削除・保存を同一トランザクションで実行） |
| `reindex_video_transcript` | 動画単位の再索引 |
| `reindex_all_videos_embeddings` | 全動画の再索引 |
| `delete_account_data` | DB・vector・object storage の削除 |

`payload` はジョブごとの引数だけを含むオブジェクトです。動画ジョブの `video_id` は、1以上かつJavaScriptの安全な整数の上限以下の整数を
受け付けます。文字列・小数・真偽値からIDへの変換はしません。アカウント削除の
`user_id` は空白だけでない文字列、全動画の再索引は空オブジェクトを指定します。
worker内の送信処理と受信処理で同じ検証を行い、不正な入力は実行リースを取得する前に
拒否します。SQSのバッチでは不正なメッセージだけを失敗として返し、他の処理は続けます。

## 構成

```text
worker_python/
├── lambda_handler.py
├── contracts.py
├── video_sql.py
├── pipeline/
└── tasks/
```

worker は modern schema と native job type のみを使用します。

SQSはat-least-once配送のため、workerは `job_executions.job_id` を15分リースでclaimします。
完了済みの重複配送は処理せず、処理中に停止した配送はリース失効後に再開します。後続ジョブIDも
親ジョブから決定的に生成するため、親の再試行で別の後続処理が増えることはありません。
`0011_job_delivery_guards.sql` をworker更新より先に適用してください。

## 主な環境変数

| 変数 | 用途 |
|---|---|
| `DATABASE_URL` | PostgreSQL |
| `SQS_QUEUE_URL` | Amazon SQS / ElasticMQ |
| `OPENAI_API_KEY` | Whisperと埋め込み |
| `EMBEDDING_PROVIDER` | `openai`（既定）または `ollama` |
| `EMBEDDING_MODEL` | OpenAIは `text-embedding-3-small` が既定。Ollamaでは明示必須（検証構成: `qwen3-embedding:4b`） |
| `USE_S3_STORAGE` | S3 互換 object storage の利用 |
| `R2_BUCKET_NAME` / `R2_S3_ENDPOINT` / `R2_S3_REGION` | R2 bucket / endpoint / region |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | R2 S3 API token（Lambda の `APP_PARAM_NAME` JSON ではこの名前を使う。`AWS_ACCESS_KEY_ID` は実行ロール予約） |
| `DB_PARAM_NAME` / `APP_PARAM_NAME` | SSM SecureString（JSON）。本番 Lambda が起動時に読む |
| `USER_SECRET_ENCRYPTION_KEY` | AES-256-GCM のユーザー秘密復号鍵 |
| `ENABLE_HEAVY_PIPELINE` | 文字起こし等の重量処理を有効化 |
| `FFMPEG_PROCESS_TIMEOUT_SECONDS` | FFmpeg / ffprobe の実時間上限（既定600秒） |
| `MEDIA_PROCESS_CPU_TIME_LIMIT_SECONDS` | メディア子プロセスのCPU時間上限（既定300秒） |
| `MEDIA_PROCESS_MEMORY_LIMIT_MB` | Linux上のメディア子プロセスのアドレス空間上限（既定2,048 MiB） |
| `MEDIA_PROCESS_OUTPUT_FILE_SIZE_LIMIT_MB` | メディア子プロセスが書くファイルのサイズ上限（既定1,024 MiB） |

ストレージ専用の認証情報は、`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`、
次に `AWS_S3_ACCESS_KEY_ID` / `AWS_S3_SECRET_ACCESS_KEY` の順で選びます。
選択する組は両方の設定が必要で、別の組やLambda実行ロールのキーとは混ぜません。
専用の設定がなければ、[Boto3標準の認証情報解決](https://docs.aws.amazon.com/boto3/latest/guide/credentials.html)
を使い、`AWS_SESSION_TOKEN` を含む一時認証情報もそのまま利用します。
通常のAmazon S3ではリージョンを明示しない限り、`AWS_DEFAULT_REGION` や
AWS設定ファイルの値をSDKが解決します。カスタムエンドポイントの既定は `auto` です。

SSMから読み込むR2認証情報も組で選びます。環境変数の `R2_*`、SSM内の `R2_*`、
SSM内の旧 `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` の順に優先し、選択する組の
片方だけが設定されている場合はエラーにします。Lambda実行ロールの認証情報は変更しません。
全SSMパラメータの取得・検証に成功してから環境変数へ反映します。空・非オブジェクトのJSONや
DBパラメータ内の `DATABASE_URL` 欠落は読込済みにせず、次の呼び出しで再試行します。
旧設定名を入力として扱う場合も、読込先は正規の `R2_*` のみです。

メディア処理の上限値は正の整数で指定します。アップロードは単体の動画ファイルとして
解析し、プレイリストや外部URL参照は受け付けません。上限を超えた処理は失敗として
扱い、既存のジョブ再試行の対象になります。

RAGAS評価は廃止しました。キューに残った `evaluate_chat_log` はAI・DB処理を実行せず終了します。

## ローカル実行

```bash
cd apps/worker
pip install -e ".[dev]"
python -m pytest tests/ -q
```

推奨構成:

```bash
docker compose up -d postgres minio minio-init elasticmq worker
docker compose logs -f worker
```

SQS を使わず pending row を処理する場合:

```bash
python scripts/process_pending.py
python scripts/process_pending.py --video-id 83
```

## Lambda image

本番は **linux/arm64** コンテナ（ECR）です。

```bash
docker buildx build --platform linux/arm64 -f Dockerfile -t videoq-worker .
```

handler は `handler.handler` です。機密は SSM SecureString
（`DB_PARAM_NAME` / `APP_PARAM_NAME`）から読み込みます。

## 埋め込みの診断

次元は定数 `EMBEDDING_DIMENSIONS = 1536` で固定し、両providerに1536を要求します。Ollamaは `/api/embed` を使用します。`EMBEDDING_VECTOR_SIZE` は廃止し、残っていても参照しません。

workerの環境変数を設定したPython環境で `python -m worker_python.check_embeddings` を実行すると、設定とDBの宣言型を検証します。`--probe` を付けた場合だけモデル出力も確認します。実モデルへの通信・料金が発生する場合があります。

APIと同じprovider・modelを使ってください。同次元でも異なるモデルのベクトルは混在できません。既存データの移行ツールは未提供です。[設定・診断・移行の制約](../../docs/guides/embeddings.md)を参照してください。

## 任意の映像キャッシュ

アップロード動画の文字起こし時に、既定で粗い代表画像と約1 FPSの高密度画像を保存します。
`VIDEO_VISUAL_ENABLED=false` で無効にできます。APIの `focus_clip` が高密度画像の必要な区間だけを読みます。
既存動画は `python scripts/prepare_visual_frames.py --video-id 42` で準備できます。
設定・保存容量・削除・精度比較は[映像確認ガイド](../../docs/guides/visual-evidence.md)を参照してください。
