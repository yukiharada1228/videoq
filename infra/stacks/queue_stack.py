import aws_cdk as cdk
from aws_cdk import (
    Duration,
    Stack,
    aws_sqs as sqs,
)
from constructs import Construct

from config.settings import VideoQConfig


class QueueStack(Stack):
    def __init__(self, scope: Construct, id: str, *,
                 config: VideoQConfig, **kwargs) -> None:
        super().__init__(scope, id, **kwargs)

        # ── Dead Letter Queue ─────────────────────────────────────────────────
        # 最大受信数を超えたメッセージ (失敗タスク) が転送される
        self.dlq = sqs.Queue(self, "WorkerDlq",
            queue_name=f"videoq-worker-dlq-{config.env_name}",
            retention_period=Duration.days(14),
            encryption=sqs.QueueEncryption.SQS_MANAGED,
        )

        # ── メインキュー (Celery ブローカー) ──────────────────────────────────
        # visibility_timeout は Worker Lambda のタイムアウト以上に設定すること。
        # Lambda が処理中にメッセージが再度見えてしまうのを防ぐため。
        self.main_queue = sqs.Queue(self, "WorkerQueue",
            queue_name=f"videoq-worker-{config.env_name}",
            visibility_timeout=Duration.seconds(
                config.sqs_visibility_timeout_seconds),
            retention_period=Duration.days(4),
            encryption=sqs.QueueEncryption.SQS_MANAGED,
            dead_letter_queue=sqs.DeadLetterQueue(
                max_receive_count=config.sqs_max_receive_count,
                queue=self.dlq,
            ),
        )

        # ── Outputs ───────────────────────────────────────────────────────────
        cdk.CfnOutput(self, "QueueUrl",
            value=self.main_queue.queue_url,
            description="Celery SQS broker queue URL",
        )
        cdk.CfnOutput(self, "QueueName",
            value=self.main_queue.queue_name,
            description="Celery SQS broker queue name",
        )
        cdk.CfnOutput(self, "DlqUrl",
            value=self.dlq.queue_url,
            description="Dead letter queue URL",
        )
