#!/usr/bin/env python3
"""
VideoQ AWS CDK アプリケーション

スタック構成:
  DataStack    - Secrets Manager (Neon 接続文字列 + アプリシークレット + R2 認証情報)
  StorageStack - ECR リポジトリ (API / Worker Lambda イメージ)
  QueueStack   - SQS (Celery ブローカー + DLQ)
  ApiStack     - Lambda (Lambda Web Adapter + Gunicorn) + API Gateway HTTP API
  WorkerStack  - Lambda (Celery タスク実行) + SQS イベントソース
  CdnStack     - CloudFront (フロントエンド + API 同一ドメイン配信, オプション)

フロントエンドは Cloudflare Pages で管理 (CDK 外)。
メディアストレージは Cloudflare R2 で管理 (CDK 外)。
DB は Neon serverless Postgres で管理 (CDK 外)。
"""
import aws_cdk as cdk

from config.settings import get_config
from stacks.api_stack import ApiStack
from stacks.cdn_stack import CdnStack
from stacks.data_stack import DataStack
from stacks.queue_stack import QueueStack
from stacks.storage_stack import StorageStack
from stacks.worker_stack import WorkerStack

app = cdk.App()

env_name = app.node.try_get_context("env") or "prod"
config = get_config(env_name)

env = cdk.Environment(account=config.aws_account, region=config.aws_region)

# ── Layer 1: データ / ストレージ / キュー (相互独立) ─────────────────────────
data = DataStack(app, f"VideoQ-Data-{env_name}",
    config=config, env=env)

storage = StorageStack(app, f"VideoQ-Storage-{env_name}",
    config=config, env=env)

queue = QueueStack(app, f"VideoQ-Queue-{env_name}",
    config=config, env=env)

# ── Layer 2: コンピューティング ───────────────────────────────────────────────
api = ApiStack(app, f"VideoQ-Api-{env_name}",
    config=config, env=env,
    db_secret=data.db_secret,
    app_secret=data.app_secret,
    sqs_queue=queue.main_queue,
    api_ecr_repo=storage.api_ecr_repo)

worker = WorkerStack(app, f"VideoQ-Worker-{env_name}",
    config=config, env=env,
    db_secret=data.db_secret,
    app_secret=data.app_secret,
    sqs_queue=queue.main_queue,
    worker_ecr_repo=storage.worker_ecr_repo)

# ── Layer 2.5: CDN (CloudFront — フロントエンドと API を同一ドメインで配信) ───
if config.custom_domain and config.certificate_arn:
    cdn = CdnStack(app, f"VideoQ-Cdn-{env_name}",
        config=config, env=env,
        api_endpoint=api.api_url,
        pages_domain=config.pages_domain,
    )

app.synth()
