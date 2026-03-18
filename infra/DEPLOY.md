# VideoQ デプロイ手順

## アーキテクチャ概要

```
ブラウザ
  │ https://videoq.jp
  ▼
CloudFront (CDN)
  ├── /api/*  ──→ API Gateway HTTP API
  │                      │
  │                      ▼
  │              Lambda API (Django + Lambda Web Adapter)
  │                      │                    │
  │                      ▼                    ▼
  │                Neon PostgreSQL      SQS キュー
  │                (pgvector)                │
  │                                          ▼
  │                                  Lambda Worker (Celery タスク)
  │                                          │
  │                                          ▼
  │                                  Cloudflare R2 (動画ストレージ)
  │
  └── /* (その他) ──→ Cloudflare Pages (フロントエンド)
```

> **なぜ CloudFront？** フロントエンド (Cloudflare Pages) と API (API Gateway) を
> 同一ドメインで配信することで、Cookie がファーストパーティになり、
> モバイルブラウザのサードパーティ Cookie ブロックによる 403 エラーを解消する。

**月額コスト目安:** ~$0.85/月 (低トラフィック時は Lambda 無料枠内で $0.05 以下)

---

## 前提条件

- AWS CLI 設定済み (`aws configure`)
- Docker Desktop 起動済み
- Node.js 20+, Python 3.12+

---

## Step 1: 外部サービスのセットアップ

### 1-1. Neon (サーバーレス PostgreSQL)

1. [neon.tech](https://neon.tech) でプロジェクト作成
2. **Pooler 接続文字列**をコピー (通常の接続文字列ではなく Pooler を使うこと)

   ```
   # ダッシュボード → Connection Details → Pooler
   postgresql://neondb_owner:****************dep-old-truth-a1co51ud-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```

   > **なぜ Pooler？** Lambda はリクエストごとに新規 DB 接続を張るため、
   > Pooler (PgBouncer) なしでは同時実行時に接続数上限に達する。

### 1-2. Cloudflare R2 (オブジェクトストレージ)

1. Cloudflare ダッシュボード → **R2** → バケット作成
   - バケット名: `videoq-media-prod`

2. **R2 API トークン**を発行
   - R2 → 概要 → API トークンを管理 → トークン作成
   - 権限: オブジェクトの読み取りと書き込み
   - 以下をメモ:
     - Access Key ID
     - Secret Access Key
     - アカウント ID (ダッシュボード URL の `/` 以降の32桁)

3. エンドポイント URL を確認:
   ```
   https://<アカウントID>.r2.cloudflarestorage.com
   ```

### 1-3. ACM 証明書 (カスタムドメイン使用時)

CloudFront でカスタムドメイン (例: `videoq.jp`) を使う場合、**us-east-1** リージョンに ACM 証明書が必要。

1. AWS コンソール → **Certificate Manager** → リージョンを **us-east-1 (バージニア北部)** に切り替え
2. 「証明書のリクエスト」 → パブリック証明書
3. ドメイン名: `videoq.jp` (必要に応じて `*.videoq.jp` も追加)
4. 検証方法: **DNS 検証** を選択
5. 表示される CNAME レコードを DNS プロバイダに追加して検証完了を待つ
6. 証明書 ARN をメモ:
   ```
   arn:aws:acm:us-east-1:<account>:certificate/<uuid>
   ```

> **注意:** CloudFront は us-east-1 の証明書のみ使用可能。他リージョンで作成した証明書は使えない。

### 1-4. Cloudflare Pages (フロントエンド)

初回は Step 8 で設定するため、ここでは不要。

---

## Step 2: CDK セットアップ

```bash
cd infra
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# AWS アカウント ID とリージョンを確認
aws sts get-caller-identity
aws configure get region
```

---

## Step 3: CDK Bootstrap & デプロイ

```bash
# 初回のみ: CDK 実行環境をアカウントに準備
cdk bootstrap aws://<AWS_ACCOUNT_ID>/<REGION>

# CloudFront + カスタムドメインを有効化する場合 (Step 1-3 の証明書が必要)
PAGES_DOMAIN=videoq.pages.dev \
CUSTOM_DOMAIN=videoq.jp \
CERTIFICATE_ARN=arn:aws:acm:us-east-1:<account>:certificate/<uuid> \
  cdk deploy --all -c env=prod
```

> **CdnStack は条件付き:** `CUSTOM_DOMAIN` と `CERTIFICATE_ARN` の両方が設定されている場合のみ CloudFront ディストリビューションが作成される。

デプロイ完了後、以下の Output をメモしておく:

```
VideoQ-Storage-prod.ApiEcrUri            = <account>.dkr.ecr.<region>.amazonaws.com/videoq-api-prod
VideoQ-Storage-prod.WorkerEcrUri         = <account>.dkr.ecr.<region>.amazonaws.com/videoq-worker-prod
VideoQ-Data-prod.DbSecretArn             = arn:aws:secretsmanager:...
VideoQ-Data-prod.AppSecretArn            = arn:aws:secretsmanager:...
VideoQ-Api-prod.ApiEndpoint              = https://xxxxxxxxxx.execute-api.<region>.amazonaws.com
VideoQ-Cdn-prod.DistributionDomainName   = dxxxxxxxxx.cloudfront.net   # CloudFront 有効時のみ
VideoQ-Cdn-prod.DistributionId           = EXXXXXXXXXXXXX              # CloudFront 有効時のみ
```

---

## Step 4: シークレットを登録

### DB シークレット (Neon 接続文字列)

```bash
aws secretsmanager put-secret-value \
  --secret-id videoq/prod/db \
  --secret-string '{
    "DATABASE_URL": "postgresql://neondb_owner:****************dep-old-truth-a1co51ud-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
  }'
```

### アプリシークレット + R2 認証情報

```bash
aws secretsmanager put-secret-value \
  --secret-id videoq/prod/app \
  --secret-string '{
    "SECRET_KEY": "<50文字以上のランダム文字列>",
    "AWS_ACCESS_KEY_ID": "<R2_ACCESS_KEY_ID>",
    "AWS_SECRET_ACCESS_KEY": "<R2_SECRET_ACCESS_KEY>",
    "AWS_S3_ENDPOINT_URL": "https://<CF_ACCOUNT_ID>.r2.cloudflarestorage.com",
    "AWS_STORAGE_BUCKET_NAME": "videoq-media-prod",
    "AWS_S3_REGION_NAME": "auto"
  }'
```

> `SECRET_KEY` の生成: `python -c "import secrets; print(secrets.token_urlsafe(50))"`

---

## Step 5: コンテナイメージをビルド & プッシュ

```bash
# ECR URI を変数に設定 (Step 3 の Output から)
API_ECR=<account>.dkr.ecr.<region>.amazonaws.com/videoq-api-prod
WORKER_ECR=<account>.dkr.ecr.<region>.amazonaws.com/videoq-worker-prod
REGION=ap-northeast-1

# ECR ログイン
aws ecr get-login-password --region $REGION \
  | docker login --username AWS --password-stdin \
    $(echo $API_ECR | cut -d/ -f1)

# API Lambda イメージ (Lambda Web Adapter)
docker build -f backend/Dockerfile.lambda \
  -t $API_ECR:latest ./backend
docker push $API_ECR:latest

# Worker Lambda イメージ
docker build -f backend/Dockerfile.worker \
  -t $WORKER_ECR:latest ./backend
docker push $WORKER_ECR:latest
```

---

## Step 6: Lambda イメージを更新

```bash
aws lambda update-function-code \
  --function-name videoq-api-prod \
  --image-uri $API_ECR:latest \
  --region $REGION

aws lambda update-function-code \
  --function-name videoq-worker-prod \
  --image-uri $WORKER_ECR:latest \
  --region $REGION

# 更新完了を待機
aws lambda wait function-updated \
  --function-name videoq-api-prod --region $REGION
aws lambda wait function-updated \
  --function-name videoq-worker-prod --region $REGION
```

---

## Step 7: Django マイグレーション (初回 & スキーマ変更時)

Docker を使った方法:
```bash
docker run --rm \
  -e DATABASE_URL="<Neon pooler URL>" \
  -e DJANGO_ENV=production \
  -e SECRET_KEY=temporary-key-for-migrate \
  --entrypoint python \
  $API_ECR:latest \
  manage.py migrate --settings=videoq.settings
```

---

## Step 8: Cloudflare Pages セットアップ (初回のみ)

1. Cloudflare ダッシュボード → **Pages** → プロジェクト作成
2. Git リポジトリを接続 (GitHub)
3. ビルド設定:

   | 項目 | 値 |
   |---|---|
   | フレームワーク | なし |
   | ビルドコマンド | `npm run build` |
   | ビルド出力ディレクトリ | `dist` |
   | ルートディレクトリ | `frontend` |

4. **環境変数**を設定:

   | 変数名 | 値 (CloudFront あり) |
   |---|---|
   | `VITE_API_URL` | `/api` (相対パス) |
   | `VITE_MAX_VIDEO_UPLOAD_SIZE_MB` | `500` |

---

## Step 9: DNS レコード設定

Step 3 で出力された `DistributionDomainName` を DNS に登録する。

| タイプ | 名前 | 値 |
|---|---|---|
| CNAME (または ALIAS) | `videoq.jp` | `dxxxxxxxxx.cloudfront.net` (Step 3 の DistributionDomainName) |

> **注意:** ルートドメイン (`videoq.jp`) の場合、CNAME は使えないため ALIAS レコード (Route 53) または CNAME フラットニング (Cloudflare DNS 等) が必要。

### 動作確認

```bash
# CloudFront 経由でフロントエンドが返ること
curl -I https://videoq.jp/

# CloudFront 経由で API が返ること
curl -I https://videoq.jp/api/health/
```

---

## 以降のデプロイ (コード変更時)

```bash
# 1. イメージをリビルド & プッシュ
docker build -f backend/Dockerfile.lambda -t $API_ECR:latest ./backend && docker push $API_ECR:latest
docker build -f backend/Dockerfile.worker -t $WORKER_ECR:latest ./backend && docker push $WORKER_ECR:latest

# 2. Lambda を更新
aws lambda update-function-code --function-name videoq-api-prod --image-uri $API_ECR:latest --region $REGION
aws lambda update-function-code --function-name videoq-worker-prod --image-uri $WORKER_ECR:latest --region $REGION

# 3. マイグレーションがある場合
DATABASE_URL="<Neon pooler URL>" python backend/manage.py migrate

# フロントエンドは Cloudflare Pages が Git push で自動デプロイ
```

---

## トラブルシューティング

### Lambda が起動しない

```bash
# CloudWatch Logs を確認
aws logs tail /aws/lambda/videoq-api-prod --follow --region $REGION
```

よくある原因:
- `DB_SECRET_ARN` / `APP_SECRET_ARN` の値が未設定 → Step 4 を再実行
- `SECRET_KEY` が未設定で production 起動に失敗 → App シークレットを確認

### DB 接続エラー

- Pooler URL を使っているか確認 (`ep-xxx-pooler` の形式)
- `?sslmode=require` がついているか確認
- Neon ダッシュボードでプロジェクトがアクティブか確認

### R2 アップロード失敗

- `AWS_S3_REGION_NAME=auto` になっているか確認 (AWS リージョン名を入れると失敗する)
- R2 API トークンに書き込み権限があるか確認

### CORS エラー (フロントエンドからの API 呼び出し失敗)

```bash
# カスタムドメインを CORS 許可リストに追加して再デプロイ
PAGES_DOMAIN=videoq.pages.dev \
CUSTOM_DOMAIN=videoq.jp \
CERTIFICATE_ARN=arn:aws:acm:us-east-1:<account>:certificate/<uuid> \
  cdk deploy --all -c env=prod
```

### CloudFront 403 エラー

- ACM 証明書が **us-east-1** で作成されているか確認
- ACM 証明書のステータスが「発行済み」になっているか確認 (DNS 検証が完了していない可能性)
- `CUSTOM_DOMAIN` の DNS レコードが CloudFront の `DistributionDomainName` を指しているか確認

### CloudFront でキャッシュが効かない / 古いコンテンツが表示される

```bash
# CloudFront キャッシュを無効化
aws cloudfront create-invalidation \
  --distribution-id <DistributionId> \
  --paths "/*"
```

### モバイルブラウザで 403 エラー (サードパーティ Cookie ブロック)

CloudFront を使って同一ドメイン配信にすることで解消される。Step 9 を実施すること。
