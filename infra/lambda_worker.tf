resource "aws_iam_role" "worker" {
  name = "videoq-worker-${var.env_name}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "worker_basic_execution" {
  role       = aws_iam_role.worker.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "worker" {
  name = "videoq-worker-${var.env_name}-policy"
  role = aws_iam_role.worker.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          aws_secretsmanager_secret.db.arn,
          aws_secretsmanager_secret.app.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:SendMessage"
        ]
        Resource = [
          aws_sqs_queue.main.arn
        ]
      }
    ]
  })
}

resource "aws_lambda_function" "worker" {
  function_name = "videoq-worker-${var.env_name}"
  role          = aws_iam_role.worker.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.worker.repository_url}:${var.image_tag}"
  memory_size   = var.worker_lambda_memory_mb
  timeout       = var.worker_lambda_timeout_seconds

  ephemeral_storage {
    size = 5120
  }

  environment {
    variables = {
      DJANGO_ENV                              = "production"
      FRONTEND_URL                            = local.frontend_url
      DB_SECRET_ARN                           = aws_secretsmanager_secret.db.arn
      APP_SECRET_ARN                          = aws_secretsmanager_secret.app.arn
      USE_S3_STORAGE                          = "true"
      CELERY_BROKER_URL                       = "sqs://"
      SQS_QUEUE_NAME                          = aws_sqs_queue.main.name
      SQS_QUEUE_URL                           = aws_sqs_queue.main.id
      CELERY_TASK_TIME_LIMIT                  = "840"
      CELERY_TASK_SOFT_TIME_LIMIT             = "780"
      USE_DATABASE_CACHE                      = "true"
      USE_MAILGUN                             = "true"
      MEDIA_PROCESS_MEMORY_LIMIT_MB           = "2048"
      MEDIA_PROCESS_CPU_TIME_LIMIT_SECONDS    = "300"
      FFMPEG_PROCESS_TIMEOUT_SECONDS          = "600"
      MEDIA_PROCESS_OUTPUT_FILE_SIZE_LIMIT_MB = "1024"
    }
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
