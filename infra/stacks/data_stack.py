import aws_cdk as cdk
from aws_cdk import (
    RemovalPolicy,
    Stack,
    aws_secretsmanager as secretsmanager,
)
from constructs import Construct

from config.settings import VideoQConfig


class DataStack(Stack):
    """
    Secrets Manager のみを管理するスタック。

    外部サービス (Neon / Cloudflare R2) の認証情報は
    初回デプロイ後に手動 or CLI で設定する。

    シークレット設定例:
      # Neon 接続文字列 (pooler エンドポイント推奨)
      aws secretsmanager put-secret-value \\
        --secret-id videoq/prod/db \\
        --secret-string '{"DATABASE_URL":"postgresql://user:pass@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/videoq?sslmode=require&connect_timeout=10"}'

      # アプリシークレット + R2 設定 (すべてのキーが環境変数として展開される)
      aws secretsmanager put-secret-value \\
        --secret-id videoq/prod/app \\
        --secret-string '{
          "SECRET_KEY": "...",
          "OPENAI_API_KEY": "sk-...",
          "AWS_ACCESS_KEY_ID": "<R2_ACCESS_KEY_ID>",
          "AWS_SECRET_ACCESS_KEY": "<R2_SECRET_ACCESS_KEY>",
          "AWS_S3_ENDPOINT_URL": "https://<CF_ACCOUNT_ID>.r2.cloudflarestorage.com",
          "AWS_STORAGE_BUCKET_NAME": "videoq-media-prod",
          "AWS_S3_REGION_NAME": "auto"
        }'
    """

    def __init__(self, scope: Construct, id: str, *,
                 config: VideoQConfig, **kwargs) -> None:
        super().__init__(scope, id, **kwargs)

        # ── Neon 接続文字列 ────────────────────────────────────────────────
        # フォーマット: {"DATABASE_URL": "postgresql://...?sslmode=require"}
        self.db_secret = secretsmanager.Secret(self, "NeonSecret",
            secret_name=f"videoq/{config.env_name}/db",
            description="Neon PostgreSQL DATABASE_URL (pooler endpoint)",
            removal_policy=RemovalPolicy.RETAIN,
        )

        # ── アプリシークレット + R2 設定 ───────────────────────────────────
        # SECRET_KEY, OPENAI_API_KEY, R2 認証情報 (AWS_ACCESS_KEY_ID 等) を一括格納。
        # settings.py の _app_secret_arn ハンドラーがすべてのキーを
        # os.environ に展開するため、環境変数名をそのままキーとして使う。
        self.app_secret = secretsmanager.Secret(self, "AppSecret",
            secret_name=f"videoq/{config.env_name}/app",
            description="App secrets + R2 credentials",
            removal_policy=RemovalPolicy.RETAIN,
        )

        # ── Outputs ───────────────────────────────────────────────────────
        cdk.CfnOutput(self, "DbSecretArn",
            value=self.db_secret.secret_arn,
            description="Neon DB secret ARN",
        )
        cdk.CfnOutput(self, "AppSecretArn",
            value=self.app_secret.secret_arn,
            description="App + R2 secrets ARN",
        )
