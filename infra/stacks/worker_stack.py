import aws_cdk as cdk
from aws_cdk import (
    Duration,
    Size,
    Stack,
    aws_ecr as ecr,
    aws_iam as iam,
    aws_lambda as lambda_,
    aws_lambda_event_sources as event_sources,
    aws_secretsmanager as secretsmanager,
    aws_sqs as sqs,
)
from constructs import Construct

from config.settings import VideoQConfig


class WorkerStack(Stack):
    """
    Worker Lambda + SQS イベントソース。

    Celery タスク (文字起こし・インデキシング等) を非同期実行。
    Neon / R2 への接続はすべてインターネット経由のため VPC 不要。
    """

    def __init__(self, scope: Construct, id: str, *,
                 config: VideoQConfig,
                 db_secret: secretsmanager.Secret,
                 app_secret: secretsmanager.Secret,
                 sqs_queue: sqs.Queue,
                 worker_ecr_repo: ecr.Repository,
                 **kwargs) -> None:
        super().__init__(scope, id, **kwargs)

        # ── IAM ロール ─────────────────────────────────────────────────────
        role = iam.Role(self, "WorkerLambdaRole",
            assumed_by=iam.ServicePrincipal("lambda.amazonaws.com"),
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name(
                    "service-role/AWSLambdaBasicExecutionRole"),
            ],
        )
        db_secret.grant_read(role)
        app_secret.grant_read(role)
        sqs_queue.grant_consume_messages(role)
        sqs_queue.grant_send_messages(role)  # タスクチェーン (transcription → indexing)

        # ── Lambda (Worker) ────────────────────────────────────────────────
        self.worker_lambda = lambda_.DockerImageFunction(self, "WorkerLambda",
            function_name=f"videoq-worker-{config.env_name}",
            code=lambda_.DockerImageCode.from_ecr(
                repository=worker_ecr_repo,
                tag_or_digest="latest",
            ),
            role=role,
            memory_size=config.worker_lambda_memory_mb,
            timeout=Duration.seconds(config.worker_lambda_timeout_seconds),
            # 動画一時ファイル用ストレージ (デフォルト 512MB → 5GB)
            ephemeral_storage_size=Size.gibibytes(5),
            environment=self._build_env(config, db_secret, app_secret, sqs_queue),
        )

        # ── SQS イベントソース ─────────────────────────────────────────────
        self.worker_lambda.add_event_source(
            event_sources.SqsEventSource(sqs_queue,
                batch_size=1,           # タスク 1 件ずつ独立処理
                max_concurrency=10,     # 同時実行 Lambda 数の上限
                report_batch_item_failures=True,  # 失敗分のみ DLQ へ
            )
        )

        # ── Outputs ────────────────────────────────────────────────────────
        cdk.CfnOutput(self, "WorkerLambdaArn",
            value=self.worker_lambda.function_arn,
            description="Worker Lambda ARN",
        )

    def _build_env(
        self,
        config: VideoQConfig,
        db_secret: secretsmanager.Secret,
        app_secret: secretsmanager.Secret,
        sqs_queue: sqs.Queue,
    ) -> dict:
        frontend_url = f"https://{config.custom_domain}" if config.custom_domain else (f"https://{config.pages_domain}" if config.pages_domain else "http://localhost:3000")
        return {
            "DJANGO_ENV": "production",
            "FRONTEND_URL": frontend_url,
            "DB_SECRET_ARN": db_secret.secret_arn,
            "APP_SECRET_ARN": app_secret.secret_arn,
            "USE_S3_STORAGE": "true",
            "CELERY_BROKER_URL": "sqs://",
            "SQS_QUEUE_NAME": sqs_queue.queue_name,
            "SQS_QUEUE_URL": sqs_queue.queue_url,
            "CELERY_TASK_TIME_LIMIT": "840",
            "CELERY_TASK_SOFT_TIME_LIMIT": "780",
            "USE_DATABASE_CACHE": "true",
            "USE_MAILGUN": "true",
            "MEDIA_PROCESS_MEMORY_LIMIT_MB": "2048",
            "MEDIA_PROCESS_CPU_TIME_LIMIT_SECONDS": "300",
            "FFMPEG_PROCESS_TIMEOUT_SECONDS": "600",
            "MEDIA_PROCESS_OUTPUT_FILE_SIZE_LIMIT_MB": "1024",
        }
