# ── Dead Letter Queue ─────────────────────────────────────────────────
# Messages that exceed the maximum receive count (failed tasks) are forwarded here.
resource "aws_sqs_queue" "dlq" {
  name                      = local.names.worker_dlq
  message_retention_seconds = 1209600 # 14 days
  sqs_managed_sse_enabled   = true
}

# ── Main queue (Celery broker) ─────────────────────────────────────────
# Keep visibility_timeout greater than or equal to the Worker Lambda timeout so
# messages do not become visible again while Lambda is processing them.
# receive_wait_time=20s enables long polling to reduce empty polls.
resource "aws_sqs_queue" "main" {
  name                       = local.names.worker
  visibility_timeout_seconds = var.sqs_visibility_timeout_seconds
  message_retention_seconds  = 345600 # 4 days
  sqs_managed_sse_enabled    = true
  receive_wait_time_seconds  = 20

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = var.sqs_max_receive_count
  })
}
