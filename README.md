# VideoQ

VideoQは動画管理・共有・分析のためのWebアプリケーションです。

## 機能概要
- 動画のアップロード・管理
- 動画グループの作成・共有
- ユーザー認証（サインアップ、ログイン、パスワードリセット）
- サブスクリプション管理（Stripe連携）
- OpenAI API連携による分析機能
- ベクトル検索（OpenSearch または Pinecone）
- RAG（Retrieval Augmented Generation）による質問応答
- 関連質問の自動生成

## セットアップ手順（Docker利用推奨）

### 1. 必要なソフトウェア
- Docker
- Docker Compose
- OpenAIアカウント（APIキー取得必須）

### 2. リポジトリのクローン
```bash
git clone https://github.com/yukiharada1228/videoq.git
cd videoq
```

### 3. 環境変数の設定
`.env` ファイルを作成し、以下の値を設定してください：

#### 必須設定
- `DJANGO_SECRET_KEY` : Django秘密鍵
- `STRIPE_SECRET_KEY` : Stripe秘密鍵
- `STRIPE_PUBLISHABLE_KEY` : Stripe公開鍵
- `STRIPE_WEBHOOK_SECRET` : Stripe Webhook秘密鍵
- `OPENAI_API_KEY` : OpenAI APIキー（動画分析・RAG機能用）

#### ベクトル検索プロバイダー設定
- `VECTOR_SEARCH_PROVIDER` : ベクトル検索プロバイダー（`opensearch` または `pinecone`、デフォルト: `opensearch`）

#### OpenSearch使用時（VECTOR_SEARCH_PROVIDER=opensearch）
- 追加設定不要（Docker Composeで自動起動）

#### Pinecone使用時（VECTOR_SEARCH_PROVIDER=pinecone）
- `PINECONE_API_KEY` : Pinecone APIキー（必須）
- `PINECONE_CLOUD` : クラウドプロバイダー（デフォルト: `aws`）
- `PINECONE_REGION` : リージョン（デフォルト: `us-east-1`）

#### データベース設定
- `POSTGRES_PASSWORD` : PostgreSQLパスワード
- `BASIC_AUTH_PASSWORD` : OpenSearchダッシュボード用パスワード

#### S3設定（動画ファイル保存用）
- `AWS_ACCESS_KEY_ID` : AWSアクセスキーID
- `AWS_SECRET_ACCESS_KEY` : AWSシークレットアクセスキー
- `AWS_STORAGE_BUCKET_NAME` : S3バケット名（例: `videoq-yukiharada`）
- `AWS_S3_REGION_NAME` : S3リージョン（例: `us-east-1`）

#### 共有URLアクセス制限設定
- `SHARE_ACCOUNT_MAX_CONCURRENT_USERS` : アカウント単位の同時アクセス上限人数（デフォルト: `30`）
- `SHARE_SESSION_TIMEOUT_MINUTES` : セッションタイムアウト時間（分、デフォルト: `10`）
- `REDIS_URL` : Redis接続URL（デフォルト: `redis://redis:6379/0`）

**S3バケットのIAMポリシー設定例:**
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "VisualEditor0",
            "Effect": "Allow",
            "Action": [
                "s3:GetLifecycleConfiguration",
                "s3:GetBucketTagging",
                "s3:GetInventoryConfiguration",
                "s3:GetObjectVersionTagging",
                "s3:GetBucketLogging",
                "s3:ListBucket",
                "s3:GetAccelerateConfiguration",
                "s3:GetObjectVersionAttributes",
                "s3:GetBucketPolicy",
                "s3:GetObjectVersionTorrent",
                "s3:GetObjectAcl",
                "s3:GetEncryptionConfiguration",
                "s3:GetBucketObjectLockConfiguration",
                "s3:GetIntelligentTieringConfiguration",
                "s3:GetBucketRequestPayment",
                "s3:GetObjectVersionAcl",
                "s3:GetObjectTagging",
                "s3:GetMetricsConfiguration",
                "s3:GetBucketOwnershipControls",
                "s3:DeleteObject",
                "s3:PutObjectAcl",
                "s3:GetBucketPublicAccessBlock",
                "s3:GetBucketPolicyStatus",
                "s3:GetObjectRetention",
                "s3:GetBucketWebsite",
                "s3:GetObjectAttributes",
                "s3:GetBucketVersioning",
                "s3:GetBucketAcl",
                "s3:GetObjectLegalHold",
                "s3:GetBucketNotification",
                "s3:GetReplicationConfiguration",
                "s3:PutObject",
                "s3:GetObject",
                "s3:GetBucketMetadataTableConfiguration",
                "s3:GetObjectTorrent",
                "s3:GetBucketCORS",
                "s3:GetAnalyticsConfiguration",
                "s3:GetObjectVersionForReplication",
                "s3:GetBucketLocation",
                "s3:GetObjectVersion"
            ],
            "Resource": [
                "arn:aws:s3:::YOUR_BUCKET_NAME",
                "arn:aws:s3:::YOUR_BUCKET_NAME/*"
            ]
        },
        {
            "Sid": "VisualEditor1",
            "Effect": "Allow",
            "Action": [
                "s3:GetAccessPoint",
                "s3:GetAccountPublicAccessBlock"
            ],
            "Resource": "*"
        }
    ]
}
```

**注意:** `YOUR_BUCKET_NAME` を実際のS3バケット名に置き換えてください。

### 4. Dockerイメージのビルドとコンテナ起動
```bash
docker compose up --build -d
```

### 5. マイグレーションの適用
```bash
docker compose exec web python manage.py migrate
```

### 6. 管理ユーザーの作成（任意）
```bash
docker compose exec web python manage.py createsuperuser
```

### 7. アプリケーションアクセス
- メインアプリ: `http://localhost:8080`
- OpenSearchダッシュボード: `http://localhost:5601`

## 主要ディレクトリ構成
- `app/` : アプリケーション本体
  - `models.py` : データモデル
  - `views.py` : ビュー・API
  - `tasks.py` : Celeryタスク
  - `base_vector_service.py` : ベクトル検索ベースクラス
  - `opensearch_service.py` : OpenSearch実装
  - `pinecone_service.py` : Pinecone実装
  - `vector_search_factory.py` : ベクトル検索ファクトリ
- `videoq/` : プロジェクト設定
- `static/` : 静的ファイル
- `templates/` : テンプレートファイル

## 依存サービス
- ベクトル検索（OpenSearch または Pinecone）
  - OpenSearch: ローカルDocker（デフォルト）
  - Pinecone: クラウドサーバレス（オプション）
- AWS S3（動画ファイル保存）
- Stripe（サブスクリプション管理）
- OpenAI API（動画分析）
- PostgreSQL（メインデータベース）
- Redis（キャッシュ・タスクキュー）

## 技術スタック
- **Webフレームワーク**: Django
- **ベクトル検索**: OpenSearch（ローカル）または Pinecone（クラウドサーバレス）
- **非同期処理**: Celery + Redis
- **データベース**: PostgreSQL
- **コンテナ化**: Docker + Docker Compose
- **決済処理**: Stripe
- **AI/ML**: OpenAI API（GPT-4o-mini、text-embedding-3-small）
- **デザインパターン**: Factory Pattern、Abstract Base Class

## アーキテクチャ

### ベクトル検索の共通化
- **BaseVectorService**: 共通機能を提供する抽象ベースクラス
- **OpenSearchService**: OpenSearch固有の実装
- **PineconeService**: Pinecone固有の実装
- **VectorSearchFactory**: 環境変数に基づくプロバイダー選択

### 主要機能
- **動画処理**: 音声抽出 → 文字起こし → チャンク分割 → ベクトル化
- **検索**: セマンティック検索による類似コンテンツ発見
- **RAG**: 検索結果を基にした質問応答
- **関連質問生成**: コンテキストに基づく質問自動生成

## ライセンス
本プロジェクトのソースコードは、個人利用・学術利用・非営利利用に限り自由にご利用いただけます。

ただし、本プロジェクトを利用したサービスを商用として公開・展開することは禁止します。

---

ご質問・不具合報告はIssueまたはPull Requestでご連絡ください。 