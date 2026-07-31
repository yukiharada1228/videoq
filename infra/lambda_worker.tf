resource "aws_iam_role" "worker" {
  name               = local.names.worker
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
}

resource "aws_iam_role_policy_attachment" "worker_basic_execution" {
  role       = aws_iam_role.worker.name
  policy_arn = local.lambda_basic_execution_policy_arn
}

data "aws_iam_policy_document" "worker_permissions" {
  statement {
    effect  = "Allow"
    actions = ["secretsmanager:GetSecretValue"]
    resources = [
      aws_secretsmanager_secret.db.arn,
      aws_secretsmanager_secret.app.arn,
    ]
  }

  statement {
    effect = "Allow"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:ChangeMessageVisibility",
      "sqs:GetQueueAttributes",
      "sqs:GetQueueUrl",
      "sqs:SendMessage",
    ]
    resources = [aws_sqs_queue.main.arn]
  }
}

resource "aws_iam_role_policy" "worker" {
  name   = local.names.worker_policy
  role   = aws_iam_role.worker.id
  policy = data.aws_iam_policy_document.worker_permissions.json
}

resource "aws_lambda_function" "worker" {
  function_name = local.names.worker
  role          = aws_iam_role.worker.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.worker.repository_url}:${var.image_tag}"
  memory_size   = var.worker_lambda_memory_mb
  timeout       = var.worker_lambda_timeout_seconds

  ephemeral_storage {
    size = 5120
  }

  environment {
    variables = merge(local.common_lambda_environment, {
      MEDIA_PROCESS_MEMORY_LIMIT_MB           = "2048"
      MEDIA_PROCESS_CPU_TIME_LIMIT_SECONDS    = "300"
      FFMPEG_PROCESS_TIMEOUT_SECONDS          = "600"
      MEDIA_PROCESS_OUTPUT_FILE_SIZE_LIMIT_MB = "1024"
    })
  }
}

resource "aws_lambda_event_source_mapping" "worker" {
  event_source_arn        = aws_sqs_queue.main.arn
  function_name           = aws_lambda_function.worker.arn
  batch_size              = 1
  function_response_types = ["ReportBatchItemFailures"]

  scaling_config {
    maximum_concurrency = 10
  }
}
