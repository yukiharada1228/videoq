# ── ApiStack: API Lambda + API Gateway HTTP API ──────────────────────────────
# Neon (external Postgres) + Cloudflare R2 (external storage) are reached over
# the public internet via TLS, so no VPC is required.

# ── IAM role ──────────────────────────────────────────────────────────────────
data "aws_iam_policy_document" "api_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "api" {
  name               = "videoq-api-${var.env_name}"
  assume_role_policy = data.aws_iam_policy_document.api_assume_role.json
}

resource "aws_iam_role_policy_attachment" "api_basic_execution" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "api_permissions" {
  statement {
    sid     = "ReadSecrets"
    effect  = "Allow"
    actions = ["secretsmanager:GetSecretValue"]
    resources = [
      aws_secretsmanager_secret.db.arn,
      aws_secretsmanager_secret.app.arn,
    ]
  }

  statement {
    sid       = "SendSqsMessages"
    effect    = "Allow"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.main.arn]
  }
}

resource "aws_iam_role_policy" "api" {
  name   = "videoq-api-${var.env_name}"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api_permissions.json
}

# ── Lambda (API) ──────────────────────────────────────────────────────────────
resource "aws_lambda_function" "api" {
  function_name = "videoq-api-${var.env_name}"
  role          = aws_iam_role.api.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.api.repository_url}:${var.image_tag}"
  memory_size   = var.api_lambda_memory_mb
  timeout       = var.api_lambda_timeout_seconds

  environment {
    variables = {
      # Django
      DJANGO_ENV           = "production"
      FRONTEND_URL         = local.frontend_url
      ALLOWED_HOSTS        = ".execute-api.${var.aws_region}.amazonaws.com,localhost"
      CORS_ALLOWED_ORIGINS = local.cors_origins
      # OAuth 2.1 issuer for the Remote MCP endpoint.
      OAUTH2_PROVIDER_ISSUER_URL = local.frontend_url
      # Secrets Manager
      DB_SECRET_ARN  = aws_secretsmanager_secret.db.arn
      APP_SECRET_ARN = aws_secretsmanager_secret.app.arn
      # Cloudflare R2
      USE_S3_STORAGE = "true"
      # Celery SQS broker
      CELERY_BROKER_URL = "sqs://"
      SQS_QUEUE_NAME    = aws_sqs_queue.main.name
      SQS_QUEUE_URL     = aws_sqs_queue.main.id
      # Lambda timeout tuning (840s = 14 min < Lambda limit 900s)
      CELERY_TASK_TIME_LIMIT      = "840"
      CELERY_TASK_SOFT_TIME_LIMIT = "780"
      # Django DatabaseCache (no Redis required)
      USE_DATABASE_CACHE = "true"
      # Mailgun
      USE_MAILGUN = "true"
      # Lambda Web Adapter
      PORT                                   = "8000"
      AWS_LWA_READINESS_CHECK_PATH           = "/api/health/"
      AWS_LWA_READINESS_CHECK_HEALTHY_STATUS = "100-499"
      AWS_LWA_INVOKE_MODE                    = "buffered"
      # API Gateway proxy count (CloudFront + API Gateway = 2)
      NUM_PROXIES = local.num_proxies
    }
  }
}

# ── API Gateway HTTP API ──────────────────────────────────────────────────────
# allow_credentials=true (JWT Cookie) cannot be combined with allow_origins "*"
# (CORS spec). When pages_domain / custom_domain are unset, local dev origins
# are used as defaults.
resource "aws_apigatewayv2_api" "http" {
  name          = "videoq-api-${var.env_name}"
  protocol_type = "HTTP"

  cors_configuration {
    allow_headers     = ["content-type", "authorization", "x-csrftoken"]
    allow_methods     = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_origins     = local.allow_origins
    allow_credentials = true
    max_age           = 3600
  }
}

resource "aws_apigatewayv2_integration" "api" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "proxy" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "ANY /{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_route" "root" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "ANY /"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}
