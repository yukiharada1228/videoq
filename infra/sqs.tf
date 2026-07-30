# ── Dead Letter Queue ─────────────────────────────────────────────────
# 最大受信数を超えたメッセージ (失敗タスク) が転送される
resource "aws_sqs_queue" "dlq" {
  name                      = "videoq-worker-dlq-${var.env_name}"
  message_retention_seconds = 1209600 # 14 days
  sqs_managed_sse_enabled   = true
}

# ── メインキュー (Celery ブローカー) ──────────────────────────────────
# visibility_timeout は Worker Lambda のタイムアウト以上に設定すること。
# Lambda が処理中にメッセージが再度見えてしまうのを防ぐため。
# receive_wait_time=20s: ロングポーリングで空のポーリングを削減。
resource "aws_sqs_queue" "main" {
  name                       = "videoq-worker-${var.env_name}"
  visibility_timeout_seconds = var.sqs_visibility_timeout_seconds
  message_retention_seconds  = 345600 # 4 days
  sqs_managed_sse_enabled    = true
  receive_wait_time_seconds  = 20

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = var.sqs_max_receive_count
  })
}
