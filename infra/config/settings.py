import os
from dataclasses import dataclass
from typing import Optional


@dataclass
class VideoQConfig:
    env_name: str
    aws_account: str
    aws_region: str

    # Lambda: API
    api_lambda_memory_mb: int = 1024
    api_lambda_timeout_seconds: int = 30

    # Lambda: Worker (ffmpeg + AI 推論でメモリを多く使う)
    worker_lambda_memory_mb: int = 3008
    worker_lambda_timeout_seconds: int = 900  # Lambda 最大 15 分

    # SQS: visibility_timeout は worker_lambda_timeout_seconds 以上に設定すること
    sqs_visibility_timeout_seconds: int = 960
    sqs_max_receive_count: int = 3

    # Cloudflare Pages ドメイン (CORS 許可リストに追加)
    pages_domain: Optional[str] = None


def get_config(env_name: str) -> VideoQConfig:
    account = os.environ.get("CDK_DEFAULT_ACCOUNT", "")
    region = os.environ.get("CDK_DEFAULT_REGION", "ap-northeast-1")

    if env_name == "prod":
        return VideoQConfig(
            env_name="prod",
            aws_account=account,
            aws_region=region,
            api_lambda_memory_mb=1024,
            worker_lambda_memory_mb=3008,
            pages_domain=os.environ.get("PAGES_DOMAIN"),
        )

    return VideoQConfig(
        env_name=env_name,
        aws_account=account,
        aws_region=region,
        api_lambda_memory_mb=1024,
        worker_lambda_memory_mb=2048,
    )
