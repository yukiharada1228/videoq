locals {
  name_prefix = "videoq"
  names = {
    api           = "${local.name_prefix}-api-${var.env_name}"
    worker        = "${local.name_prefix}-worker-${var.env_name}"
    worker_dlq    = "${local.name_prefix}-worker-dlq-${var.env_name}"
    worker_policy = "${local.name_prefix}-worker-${var.env_name}-policy"
  }

  enable_cdn = var.custom_domain != "" && var.certificate_arn != ""

  frontend_url = (
    var.custom_domain != "" ? "https://${var.custom_domain}" : (
      var.pages_domain != "" ? "https://${var.pages_domain}" : "http://localhost:3000"
    )
  )

  configured_origins = compact([
    var.custom_domain != "" ? "https://${var.custom_domain}" : "",
    var.pages_domain != "" ? "https://${var.pages_domain}" : "",
  ])

  allow_origins = length(local.configured_origins) > 0 ? local.configured_origins : [
    "http://localhost:3000",
    "http://localhost:5173",
  ]
  cors_origins = join(",", local.allow_origins)
  num_proxies  = local.enable_cdn ? "2" : "1"

  lambda_basic_execution_policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  common_lambda_environment = {
    DJANGO_ENV                  = "production"
    FRONTEND_URL                = local.frontend_url
    DB_SECRET_ARN               = aws_secretsmanager_secret.db.arn
    APP_SECRET_ARN              = aws_secretsmanager_secret.app.arn
    USE_S3_STORAGE              = "true"
    CELERY_BROKER_URL           = "sqs://"
    SQS_QUEUE_NAME              = aws_sqs_queue.main.name
    SQS_QUEUE_URL               = aws_sqs_queue.main.id
    CELERY_TASK_TIME_LIMIT      = "840"
    CELERY_TASK_SOFT_TIME_LIMIT = "780"
    USE_DATABASE_CACHE          = "true"
    USE_MAILGUN                 = "true"
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

  api_path_patterns = [
    "/api/*",
    "/.well-known/*",
  ]
}
