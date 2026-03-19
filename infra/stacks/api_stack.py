import aws_cdk as cdk
from aws_cdk import (
    Duration,
    Stack,
    aws_apigatewayv2 as apigwv2,
    aws_apigatewayv2_integrations as integrations,
    aws_ecr as ecr,
    aws_iam as iam,
    aws_lambda as lambda_,
    aws_secretsmanager as secretsmanager,
    aws_sqs as sqs,
)
from constructs import Construct

from config.settings import VideoQConfig


class ApiStack(Stack):
    """
    API Lambda + API Gateway HTTP API。

    Neon (外部 Postgres) + Cloudflare R2 (外部ストレージ) への接続は
    すべてインターネット経由 TLS となるため VPC は不要。
    """

    def __init__(self, scope: Construct, id: str, *,
                 config: VideoQConfig,
                 db_secret: secretsmanager.Secret,
                 app_secret: secretsmanager.Secret,
                 sqs_queue: sqs.Queue,
                 api_ecr_repo: ecr.Repository,
                 **kwargs) -> None:
        super().__init__(scope, id, **kwargs)

        # ── IAM ロール ─────────────────────────────────────────────────────
        # VPC 不要なので BasicExecutionRole で十分
        role = iam.Role(self, "ApiLambdaRole",
            assumed_by=iam.ServicePrincipal("lambda.amazonaws.com"),
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name(
                    "service-role/AWSLambdaBasicExecutionRole"),
            ],
        )
        db_secret.grant_read(role)
        app_secret.grant_read(role)
        sqs_queue.grant_send_messages(role)

        # ── Lambda (API) ───────────────────────────────────────────────────
        self.api_lambda = lambda_.DockerImageFunction(self, "ApiLambda",
            function_name=f"videoq-api-{config.env_name}",
            code=lambda_.DockerImageCode.from_ecr(
                repository=api_ecr_repo,
                tag_or_digest="latest",
            ),
            role=role,
            memory_size=config.api_lambda_memory_mb,
            timeout=Duration.seconds(config.api_lambda_timeout_seconds),
            environment=self._build_env(config, db_secret, app_secret, sqs_queue),
        )

        # ── API Gateway HTTP API ───────────────────────────────────────────
        # allowCredentials=True (JWT Cookie) は allowOrigin="*" と併用不可 (CORS 仕様)。
        # pages_domain / custom_domain 未設定時はローカル開発用オリジンをデフォルトとする。
        allow_origins = []
        if config.custom_domain:
            allow_origins.append(f"https://{config.custom_domain}")
        if config.pages_domain:
            allow_origins.append(f"https://{config.pages_domain}")
        if not allow_origins:
            allow_origins = ["http://localhost:3000", "http://localhost:5173"]
        http_api = apigwv2.HttpApi(self, "HttpApi",
            api_name=f"videoq-api-{config.env_name}",
            cors_preflight=apigwv2.CorsPreflightOptions(
                allow_headers=["content-type", "authorization", "x-csrftoken"],
                allow_methods=[
                    apigwv2.CorsHttpMethod.GET,
                    apigwv2.CorsHttpMethod.POST,
                    apigwv2.CorsHttpMethod.PUT,
                    apigwv2.CorsHttpMethod.PATCH,
                    apigwv2.CorsHttpMethod.DELETE,
                    apigwv2.CorsHttpMethod.OPTIONS,
                ],
                allow_origins=allow_origins,
                allow_credentials=True,  # JWT Cookie に必要
                max_age=Duration.hours(1),
            ),
        )

        integration = integrations.HttpLambdaIntegration(
            "ApiIntegration",
            self.api_lambda,
            payload_format_version=apigwv2.PayloadFormatVersion.VERSION_2_0,
        )
        http_api.add_routes(
            path="/{proxy+}",
            methods=[apigwv2.HttpMethod.ANY],
            integration=integration,
        )
        http_api.add_routes(
            path="/",
            methods=[apigwv2.HttpMethod.ANY],
            integration=integration,
        )

        self.api_url: str = http_api.api_endpoint

        # ── Outputs ────────────────────────────────────────────────────────
        cdk.CfnOutput(self, "ApiEndpoint",
            value=self.api_url,
            description="API Gateway endpoint (Cloudflare Pages の VITE_API_URL に設定)",
        )

    def _build_env(
        self,
        config: VideoQConfig,
        db_secret: secretsmanager.Secret,
        app_secret: secretsmanager.Secret,
        sqs_queue: sqs.Queue,
    ) -> dict:
        origins = []
        if config.custom_domain:
            origins.append(f"https://{config.custom_domain}")
        if config.pages_domain:
            origins.append(f"https://{config.pages_domain}")
        cors_origins = ",".join(origins) if origins else "http://localhost:3000,http://localhost:5173"
        frontend_url = f"https://{config.custom_domain}" if config.custom_domain else (f"https://{config.pages_domain}" if config.pages_domain else "http://localhost:3000")

        return {
            # Django
            "DJANGO_ENV": "production",
            "FRONTEND_URL": frontend_url,
            "ALLOWED_HOSTS": f".execute-api.{self.region}.amazonaws.com,localhost",
            "CORS_ALLOWED_ORIGINS": cors_origins,
            # Secrets Manager
            # DB_SECRET_ARN: {"DATABASE_URL": "postgresql://...@neon.tech/..."}
            "DB_SECRET_ARN": db_secret.secret_arn,
            # APP_SECRET_ARN: SECRET_KEY, R2 認証情報 (AWS_*) を含む
            "APP_SECRET_ARN": app_secret.secret_arn,
            # Cloudflare R2 設定 (app_secret の中身が展開されるが明示的にも設定)
            "USE_S3_STORAGE": "true",
            # Celery SQS ブローカー
            "CELERY_BROKER_URL": "sqs://",
            "SQS_QUEUE_NAME": sqs_queue.queue_name,
            "SQS_QUEUE_URL": sqs_queue.queue_url,
            # Lambda タイムアウト調整 (840s = 14 分 < Lambda 上限 900s)
            "CELERY_TASK_TIME_LIMIT": "840",
            "CELERY_TASK_SOFT_TIME_LIMIT": "780",
            # Django DatabaseCache (Redis 不要)
            "USE_DATABASE_CACHE": "true",
            # Mailgun
            "USE_MAILGUN": "true",
            # Lambda Web Adapter
            "PORT": "8000",
            "AWS_LWA_READINESS_CHECK_PATH": "/api/health/",
            "AWS_LWA_READINESS_CHECK_HEALTHY_STATUS": "100-499",
            "AWS_LWA_INVOKE_MODE": "buffered",
            # API Gateway プロキシ数 (CloudFront + API Gateway = 2)
            "NUM_PROXIES": "2" if config.custom_domain else "1",
        }
