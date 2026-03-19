import aws_cdk as cdk
from aws_cdk import (
    RemovalPolicy,
    Stack,
    aws_ecr as ecr,
)
from constructs import Construct

from config.settings import VideoQConfig


class StorageStack(Stack):
    """
    Lambda コンテナイメージ用 ECR リポジトリのみを管理。

    メディアストレージは Cloudflare R2 (外部) に移行したため S3 は不要。
    フロントエンドは Cloudflare Pages に移行したため S3 静的ホスティングも不要。
    """

    def __init__(self, scope: Construct, id: str, *,
                 config: VideoQConfig, **kwargs) -> None:
        super().__init__(scope, id, **kwargs)

        # ── ECR: API Lambda ───────────────────────────────────────────────
        self.api_ecr_repo = ecr.Repository(self, "ApiEcrRepo",
            repository_name=f"videoq-api-{config.env_name}",
            removal_policy=RemovalPolicy.DESTROY,
            lifecycle_rules=[
                # 古いイメージを自動削除してストレージコスト削減
                ecr.LifecycleRule(max_image_count=5),
            ],
        )

        # ── ECR: Worker Lambda ────────────────────────────────────────────
        self.worker_ecr_repo = ecr.Repository(self, "WorkerEcrRepo",
            repository_name=f"videoq-worker-{config.env_name}",
            removal_policy=RemovalPolicy.DESTROY,
            lifecycle_rules=[
                ecr.LifecycleRule(max_image_count=5),
            ],
        )

        # ── Outputs ───────────────────────────────────────────────────────
        cdk.CfnOutput(self, "ApiEcrUri",
            value=self.api_ecr_repo.repository_uri,
            description="API Lambda ECR URI",
        )
        cdk.CfnOutput(self, "WorkerEcrUri",
            value=self.worker_ecr_repo.repository_uri,
            description="Worker Lambda ECR URI",
        )
