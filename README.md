# VideoQ

[![Django CI](https://github.com/yukiharada1228/videoq/actions/workflows/django.yml/badge.svg)](https://github.com/yukiharada1228/videoq/actions/workflows/django.yml)
[![Python](https://img.shields.io/badge/python-3.12-blue.svg)](https://www.python.org/downloads/)
[![Django](https://img.shields.io/badge/django-5.2.4-green.svg)](https://www.djangoproject.com/)

VideoQは動画管理・共有・分析のためのWebアプリケーションです。AI技術を活用して動画コンテンツを自動分析し、セマンティック検索やRAG（Retrieval Augmented Generation）による質問応答機能を提供します。

## 🚀 主要機能

### 📹 動画管理
- **動画アップロード**: 複数形式対応（MP4、AVI、MOV等）
- **動画グループ**: 関連動画をグループ化して管理
- **メタデータ管理**: タイトル、説明、タグ付け
- **共有機能**: 共有URL

### 🤖 AI分析機能
- **自動文字起こし**: OpenAI Whisperによる音声認識
- **セマンティック検索**: ベクトル検索による類似コンテンツ発見
- **RAG質問応答**: 動画内容に基づく質問応答
- **関連質問生成**: AIによる自動質問生成

### 🔍 検索・分析
- **全文検索**: 文字起こしテキストの検索
- **セマンティック検索**: 意味的な類似性による検索
- **時系列分析**: 動画内の特定時間へのジャンプ
- **コンテンツ分析**: 動画内容の自動要約

### 👥 ユーザー管理
- **認証システム**: サインアップ、ログイン、パスワードリセット
- **アクセス制限**: 共有URLの同時アクセス制限
- **BASIC認証**: 環境変数による有効/無効制御

## 🏗️ アーキテクチャ

### 技術スタック
- **Webフレームワーク**: Django 5.2.4
- **データベース**: PostgreSQL
- **ベクトル検索**: OpenSearch（ローカル）または Pinecone（クラウド）
- **非同期処理**: Celery + Redis
- **コンテナ化**: Docker + Docker Compose
- **AI/ML**: OpenAI API（GPT-4o-mini、text-embedding-3-small）
- **リバースプロキシ**: Nginx

### システム構成

#### ローカル版（デフォルト）
```
┌─────────────────┐    ┌─────────────────┐
│     Nginx       │───▶│   Django Web    │
│   (Port 8080)   │    │   (Port 8000)   │
└─────────────────┘    └─────────────────┘
                                │
                                ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   PostgreSQL    │◀───│     Redis       │◀───│    Celery       │
│   (データベース)  │    │   (Cache/Queue) │    │    Worker       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   OpenSearch    │    │   OpenAI API    │    │   ローカル       │
│   (ベクトル検索)  │    │   (AI分析)      │    │   (動画保存)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

#### AWS本番環境（Terraform構成）
```
┌─────────────────┐    ┌─────────────────┐
│   Route 53      │───▶│   ALB           │
│   (DNS)         │    │   (HTTPS/HTTP)  │
└─────────────────┘    └─────────┬───────┘
                                  │
                    ┌─────────────▼───────┐
                    │   ECS Fargate       │
                    │   ┌───────────────┐ │
                    │   │Web Service    │ │
                    │   │(Django)       │ │
                    │   └───────────────┘ │
                    │   ┌───────────────┐ │
                    │   │Worker         │ │
                    │   │(Celery)       │ │
                    │   └───────────────┘ │
                    └─────────┬───────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼───────┐    ┌───────▼───────┐    ┌───────▼───────┐
│   RDS         │    │   ElastiCache  │    │   S3 Bucket   │
│   PostgreSQL  │    │   Redis        │    │   (動画保存)   │
│   (データベース) │    │   (Cache/Queue)│    │               │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼───────┐    ┌───────▼───────┐    ┌───────▼───────┐
│   Pinecone    │    │   OpenAI API   │    │   Mailgun     │
│   (ベクトル検索) │    │   (AI分析)     │    │   (メール送信)  │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                    ┌─────────▼───────┐
                    │   ECR           │
                    │   (コンテナ)     │
                    └─────────────────┘
```

## 📋 セットアップ手順

### 1. 前提条件

#### 共通要件
- Docker & Docker Compose
- OpenAI APIキー

#### ローカル版（デフォルト）
- 追加要件なし（ローカルファイルシステムを使用）

#### AWS本番環境（Terraform構成）
- AWS CLI設定済み
- Terraform 1.3.0以上
- ドメイン名（Route 53で管理）
- Pinecone APIキー
- Mailgun APIキー

### 2. リポジトリのクローン
```bash
git clone https://github.com/yukiharada1228/videoq.git
cd videoq
```

### 3. 環境変数の設定
`.env` ファイルを作成し、以下の値を設定してください：

#### 🔐 必須設定
```bash
# Django設定
DJANGO_SECRET_KEY=your-secret-key-here

# OpenAI API（動画分析・RAG機能用）
OPENAI_API_KEY=your-openai-api-key-here

# BASIC認証設定
BASIC_AUTH_ENABLED=TRUE
BASIC_AUTH_USERNAME=admin
BASIC_AUTH_PASSWORD=your-basic-auth-password
```

#### 🔍 ベクトル検索設定
```bash
# ベクトル検索プロバイダー（opensearch または pinecone）
VECTOR_SEARCH_PROVIDER=opensearch

# OpenSearch使用時（デフォルト）
# 追加設定不要（Docker Composeで自動起動）

# Pinecone使用時
PINECONE_API_KEY=your-pinecone-api-key
PINECONE_CLOUD=aws
PINECONE_REGION=us-east-1
```

#### 🗄️ データベース設定
```bash
POSTGRES_PASSWORD=your-postgres-password
```

#### 🔒 BASIC認証設定
```bash
# BASIC認証の有効/無効（デフォルト: TRUE）
BASIC_AUTH_ENABLED=TRUE
BASIC_AUTH_USERNAME=admin
BASIC_AUTH_PASSWORD=your-basic-auth-password
```

#### 👤 サインアップ受付制御
```bash
# 新規登録の有効/無効（デフォルト: TRUE）
SIGNUP_ENABLED=TRUE
```

#### 💾 ファイルストレージ設定

##### ローカル版（デフォルト・開発環境推奨）
```bash
# ローカルファイル保存
USE_S3=FALSE

# ファイル保存場所
# - 静的ファイル: ./static/
# - メディアファイル: ./media/
# - 動画ファイル: ./media/videos/
```

##### AWS本番環境（Terraform構成）
```bash
# S3ファイル保存（Terraformで自動設定）
USE_S3=TRUE
# AWS認証情報はECSタスクロールで自動管理
# S3バケット名はTerraformで自動生成
```


#### 📧 メール設定（オプション）
```bash
# Mailgun使用時
USE_MAILGUN=TRUE
MAILGUN_API_KEY=your-mailgun-api-key
MAILGUN_SENDER_DOMAIN=your-domain.com
DEFAULT_FROM_EMAIL=noreply@your-domain.com
```

#### ⚙️ 共有URLアクセス制限設定
```bash
SHARE_ACCOUNT_MAX_CONCURRENT_USERS=30
SHARE_SESSION_TIMEOUT_MINUTES=10
REDIS_URL=redis://redis:6379/0
```

### 4. Dockerコンテナの起動
```bash
# 全サービスを起動
docker compose up --build -d

# ログの確認
docker compose logs -f
```

### 5. データベースの初期化
```bash
# マイグレーションの適用
docker compose exec web python manage.py migrate

# 管理ユーザーの作成（オプション）
docker compose exec web python manage.py createsuperuser
```

### 6. アプリケーションアクセス
- **メインアプリ**: `http://localhost:8080`
- **OpenSearchダッシュボード**: `http://localhost:5601`
- **Flower（Celery監視）**: `http://localhost:5555`

## 📁 プロジェクト構造

```
videoq/
├── app/                          # メインアプリケーション
│   ├── models.py                 # データモデル
│   ├── views.py                  # ビュー・API
│   ├── tasks.py                  # Celeryタスク
│   ├── middleware.py             # BASIC認証ミドルウェア
│   ├── share_access_middleware.py # 共有アクセス制限
│   ├── base_vector_service.py    # ベクトル検索ベースクラス
│   ├── opensearch_service.py     # OpenSearch実装
│   ├── pinecone_service.py       # Pinecone実装
│   ├── vector_search_factory.py  # ベクトル検索ファクトリ
│   ├── services.py               # ビジネスロジック
│   ├── crypto_utils.py           # 暗号化ユーティリティ
│   └── templates/                # テンプレート
├── videoq/                       # プロジェクト設定
│   ├── settings.py               # Django設定
│   ├── urls.py                   # URL設定
│   └── celery.py                 # Celery設定
├── static/                       # 静的ファイル（ローカル版）
├── media/                        # メディアファイル（ローカル版）
│   └── videos/                   # 動画ファイル保存場所
├── docker-compose.yml            # Docker Compose設定
├── Dockerfile                    # Dockerイメージ設定
├── nginx.conf                    # Nginx設定
└── requirements.txt               # Python依存関係
```

### ファイル保存場所

#### ローカル版
- **静的ファイル**: `./static/`
- **メディアファイル**: `./media/`
- **動画ファイル**: `./media/videos/`

#### S3版
- **静的ファイル**: S3バケット内の`static/`ディレクトリ
- **メディアファイル**: S3バケット内の`media/`ディレクトリ
- **動画ファイル**: S3バケット内の`media/videos/`ディレクトリ

## 🔧 主要コンポーネント

### ベクトル検索システム
- **BaseVectorService**: 共通機能を提供する抽象ベースクラス
- **OpenSearchService**: ローカルOpenSearch実装
- **PineconeService**: クラウドPinecone実装
- **VectorSearchFactory**: 環境変数によるプロバイダー選択

### 動画処理パイプライン

#### ローカル版
1. **動画アップロード**: ファイル検証・ローカル保存（`./media/videos/`）
2. **音声抽出**: FFmpegによる音声分離
3. **文字起こし**: OpenAI Whisper API
4. **チャンク分割**: 意味的な単位での分割
5. **ベクトル化**: OpenAI Embedding API
6. **インデックス保存**: ベクトル検索エンジン

#### S3版
1. **動画アップロード**: ファイル検証・S3保存
2. **音声抽出**: FFmpegによる音声分離
3. **文字起こし**: OpenAI Whisper API
4. **チャンク分割**: 意味的な単位での分割
5. **ベクトル化**: OpenAI Embedding API
6. **インデックス保存**: ベクトル検索エンジン

### 共有システム
- **ShareAccessMiddleware**: 同時アクセス制限
- **ShareAccessService**: 共有ロジック
- **CryptoUtils**: URL暗号化

## 🚀 デプロイメント

### ローカル開発（ローカルストレージ版）
```bash
# 開発環境での起動（ローカルファイル保存）
USE_S3=FALSE BASIC_AUTH_ENABLED=FALSE docker compose up --build -d
```

### AWS本番環境（Terraform構成）

#### 1. インフラのデプロイ
```bash
# 本番環境ディレクトリに移動
cd infra/prod

# terraform.tfvarsファイルを作成
cp terraform.tfvars.example terraform.tfvars
# 必要な値を設定（ドメイン名、APIキーなど）

# Terraformの初期化
terraform init

# プランの確認
terraform plan

# インフラのデプロイ
terraform apply
```

#### 2. アプリケーションのデプロイ
```bash
# ECRリポジトリのURLを取得
aws ecr describe-repositories --repository-names videoq-prod-web

# Dockerイメージのビルド・プッシュ
docker build -t videoq-prod-web .
docker tag videoq-prod-web:latest <ECR_URI>:latest
docker push <ECR_URI>:latest

# ECSサービスの更新
aws ecs update-service --cluster videoq-prod --service videoq-prod-web --force-new-deployment
```

#### 3. 環境変数・シークレットの管理
- **Secrets Manager**: パスワード、APIキーなどの機密情報
- **ECSタスク定義**: 環境変数とシークレットの参照
- **IAMロール**: S3、RDS、ElastiCacheへのアクセス権限

#### 4. 監視・ログ
- **CloudWatch Logs**: アプリケーションログ
- **CloudWatch Metrics**: パフォーマンス監視
- **ALB Health Checks**: ヘルスチェック


## 📊 監視・ログ

### ログの確認
```bash
# 全サービスのログ
docker compose logs -f

# 特定サービスのログ
docker compose logs -f web
docker compose logs -f worker
```

### ヘルスチェック

#### ローカル環境
- **アプリケーション**: `http://localhost:8080/health/`
- **OpenSearch**: `http://localhost:5601`
- **Flower**: `http://localhost:5555`

#### AWS本番環境
- **アプリケーション**: `https://your-domain.com/health/`
- **ALB Health Check**: `/health`エンドポイント
- **CloudWatch**: メトリクス・ログの監視

## 🔒 セキュリティ

### 認証・認可
- **BASIC認証**: 環境変数による制御
- **Django認証**: ユーザー管理
- **共有アクセス制限**: 同時接続数制限

### データ保護
- **暗号化**: 共有URLの暗号化
- **セッション管理**: セキュアなセッション設定
- **CSRF保護**: Django標準のCSRF保護

#### AWS本番環境のセキュリティ
- **VPC**: プライベートサブネットでのアプリケーション実行
- **Security Groups**: 最小権限の原則に基づくアクセス制御
- **Secrets Manager**: 機密情報の暗号化保存
- **RDS暗号化**: データベースの保存時暗号化
- **S3暗号化**: オブジェクトレベルの暗号化
- **HTTPS**: ALBでのSSL/TLS終端
