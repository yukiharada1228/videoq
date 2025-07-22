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
- Flower（Celery監視）: `http://localhost:5555`

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