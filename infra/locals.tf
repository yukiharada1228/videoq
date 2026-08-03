locals {
  name_prefix = "videoq"
  names = {
    worker        = "${local.name_prefix}-worker-${var.env_name}"
    worker_dlq    = "${local.name_prefix}-worker-dlq-${var.env_name}"
    worker_policy = "${local.name_prefix}-worker-${var.env_name}-policy"
  }

  lambda_basic_execution_policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  common_lambda_environment = {
    DB_SECRET_ARN         = aws_secretsmanager_secret.db.arn
    APP_SECRET_ARN        = aws_secretsmanager_secret.app.arn
    USE_S3_STORAGE        = "true"
    SQS_QUEUE_NAME        = aws_sqs_queue.main.name
    SQS_QUEUE_URL         = aws_sqs_queue.main.id
    FRONTEND_URL          = "https://videoq.jp"
    EMBEDDING_PROVIDER    = "openai"
    EMBEDDING_MODEL       = "text-embedding-3-small"
    EMBEDDING_VECTOR_SIZE = "1536"
    ENABLE_HEAVY_PIPELINE = "true"
  }

  ecr_lifecycle_policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep only the last 5 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 5
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}
