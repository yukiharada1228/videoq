# VideoQ

VideoQは動画管理・共有・分析のためのWebアプリケーションです。

## 機能概要
- 動画のアップロード・管理
- 動画グループの作成・共有
- ユーザー認証（サインアップ、ログイン、パスワードリセット）
- サブスクリプション管理（Stripe連携）
- OpenAI API連携による分析機能
- OpenSearchによるベクトル検索

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
- `STRIPE_SECRET_KEY` : Stripe秘密鍵
- `STRIPE_PUBLISHABLE_KEY` : Stripe公開鍵
- `STRIPE_WEBHOOK_SECRET` : Stripe Webhook秘密鍵
- `SECRET_KEY` : Django秘密鍵

### 4. Dockerイメージのビルドとコンテナ起動
```bash
docker-compose up --build
```

### 5. マイグレーションの適用
別のターミナルで下記コマンドを実行してください。
```bash
docker-compose exec web python manage.py migrate
```

### 6. 管理ユーザーの作成（任意）
```bash
docker-compose exec web python manage.py createsuperuser
```

アプリは `http://localhost:8000` でアクセスできます。
OpenSearchダッシュボードは `http://localhost:5601` でアクセスできます。

## 主要ディレクトリ構成
- `app/` : アプリケーション本体（モデル、ビュー、サービス等）
- `videoq/` : プロジェクト設定
- `static/` : 静的ファイル
- `templates/` : テンプレートファイル

## 依存サービス
- OpenSearch（ベクトルDB、ローカルDocker）
- Stripe（サブスクリプション管理）
- OpenAI API（動画分析）
- PostgreSQL（メインデータベース）
- Redis（キャッシュ・タスクキュー）

## 技術スタック
- Django（Webフレームワーク）
- OpenSearch（ベクトル検索）
- Celery（非同期タスク処理）
- Docker（コンテナ化）
- Stripe（決済処理）

## ライセンス
本プロジェクトのソースコードは、個人利用・学術利用・非営利利用に限り自由にご利用いただけます。

ただし、本プロジェクトを利用したサービスを商用として公開・展開することは禁止します。

---

ご質問・不具合報告はIssueまたはPull Requestでご連絡ください。 