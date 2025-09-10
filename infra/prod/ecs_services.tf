resource "aws_ecs_task_definition" "web" {
  family                   = "${var.project}-${var.environment}-web"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name      = "web"
      image     = "${aws_ecr_repository.web.repository_url}:latest"
      essential = true
      portMappings = [
        {
          containerPort = 8000
          hostPort      = 8000
          protocol      = "tcp"
        }
      ]
      environment = [
        { name = "FRONTEND_URL", value = "https://${var.domain_name}" },
        { name = "DOMAIN", value = "https://${var.domain_name}" },
        { name = "DJANGO_ALLOWED_HOSTS", value = "localhost,127.0.0.1,0.0.0.0,${var.domain_name},${aws_lb.web.dns_name}" },
        { name = "DJANGO_CSRF_TRUSTED_ORIGINS", value = "http://localhost:8080,http://127.0.0.1:8080,https://${var.domain_name}" },
        { name = "VIDEO_UPLOAD_MAX_SIZE_MB", value = "100" },
        { name = "USE_S3", value = "TRUE" },
        { name = "AWS_STORAGE_BUCKET_NAME", value = aws_s3_bucket.app.bucket },
        { name = "AWS_DEFAULT_REGION", value = var.aws_region },
        { name = "REDIS_URL", value = "redis://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379/0" },
        { name = "CELERY_BROKER_URL", value = "redis://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379/1" },
        { name = "CELERY_RESULT_BACKEND", value = "redis://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379/2" },
        { name = "SHARE_ACCOUNT_MAX_CONCURRENT_USERS", value = "30" },
        { name = "SHARE_SESSION_TIMEOUT_MINUTES", value = "10" },
        { name = "POSTGRES_HOST", value = aws_db_instance.postgres.address },
        { name = "POSTGRES_PORT", value = tostring(aws_db_instance.postgres.port) },
        { name = "POSTGRES_DB", value = aws_db_instance.postgres.db_name },
        { name = "POSTGRES_USER", value = var.db_username },
        { name = "USE_MAILGUN", value = "TRUE" },
        { name = "MAILGUN_SENDER_DOMAIN", value = var.mailgun_sender_domain },
        { name = "VECTOR_SEARCH_PROVIDER", value = "pinecone" },
        { name = "PINECONE_CLOUD", value = "aws" },
        { name = "PINECONE_REGION", value = var.pinecone_environment },
        { name = "DEFAULT_MAX_VIDEOS_PER_USER", value = "25" },
        { name = "SIGNUP_ENABLED", value = "TRUE" },
        { name = "BASIC_AUTH_ENABLED", value = "TRUE" },
        { name = "BASIC_AUTH_USERNAME", value = "admin" },
        # HTTPS設定（本番環境）
        { name = "SECURE_SSL_REDIRECT", value = "TRUE" },
        { name = "SECURE_HSTS_SECONDS", value = "31536000" },
        { name = "SECURE_HSTS_INCLUDE_SUBDOMAINS", value = "TRUE" },
        { name = "SECURE_HSTS_PRELOAD", value = "TRUE" },
        # セッション・CSRF設定（本番環境）
        { name = "SESSION_COOKIE_SECURE", value = "TRUE" },
        { name = "SESSION_COOKIE_AGE", value = "1209600" },
        { name = "CSRF_COOKIE_SECURE", value = "TRUE" },
      ]
      secrets = [
        { name = "POSTGRES_PASSWORD", valueFrom = aws_secretsmanager_secret.db_password.arn },
        { name = "PINECONE_API_KEY", valueFrom = aws_secretsmanager_secret.pinecone_api_key.arn },
        { name = "DJANGO_SECRET_KEY", valueFrom = aws_secretsmanager_secret.django_secret_key.arn },
        { name = "MAILGUN_API_KEY", valueFrom = aws_secretsmanager_secret.mailgun_api_key.arn },
        { name = "BASIC_AUTH_PASSWORD", valueFrom = aws_secretsmanager_secret.basic_auth_password.arn },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.ecs.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "web"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "web" {
  name            = "${var.project}-${var.environment}-web"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.web.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.ecs_service.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "web"
    container_port   = 8000
  }

  depends_on = [aws_lb_listener.http]
}


resource "aws_ecs_task_definition" "worker" {
  family                   = "${var.project}-${var.environment}-worker"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name      = "worker"
      image     = "${aws_ecr_repository.worker.repository_url}:latest"
      essential = true
      command   = ["celery", "-A", "videoq", "worker", "-l", "INFO"]
      environment = [
        { name = "FRONTEND_URL", value = "https://${var.domain_name}" },
        { name = "DOMAIN", value = "https://${var.domain_name}" },
        { name = "DJANGO_ALLOWED_HOSTS", value = "localhost,127.0.0.1,0.0.0.0,${var.domain_name}" },
        { name = "DJANGO_CSRF_TRUSTED_ORIGINS", value = "http://localhost:8080,http://127.0.0.1:8080,https://${var.domain_name}" },
        { name = "VIDEO_UPLOAD_MAX_SIZE_MB", value = "100" },
        { name = "USE_S3", value = "TRUE" },
        { name = "AWS_STORAGE_BUCKET_NAME", value = aws_s3_bucket.app.bucket },
        { name = "AWS_DEFAULT_REGION", value = var.aws_region },
        { name = "REDIS_URL", value = "redis://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379/0" },
        { name = "CELERY_BROKER_URL", value = "redis://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379/1" },
        { name = "CELERY_RESULT_BACKEND", value = "redis://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379/2" },
        { name = "SHARE_ACCOUNT_MAX_CONCURRENT_USERS", value = "30" },
        { name = "SHARE_SESSION_TIMEOUT_MINUTES", value = "10" },
        { name = "POSTGRES_HOST", value = aws_db_instance.postgres.address },
        { name = "POSTGRES_PORT", value = tostring(aws_db_instance.postgres.port) },
        { name = "POSTGRES_DB", value = aws_db_instance.postgres.db_name },
        { name = "POSTGRES_USER", value = var.db_username },
        { name = "USE_MAILGUN", value = "TRUE" },
        { name = "MAILGUN_SENDER_DOMAIN", value = var.mailgun_sender_domain },
        { name = "VECTOR_SEARCH_PROVIDER", value = "pinecone" },
        { name = "PINECONE_CLOUD", value = "aws" },
        { name = "PINECONE_REGION", value = var.pinecone_environment },
        { name = "DEFAULT_MAX_VIDEOS_PER_USER", value = "25" },
        { name = "SIGNUP_ENABLED", value = "TRUE" },
        { name = "BASIC_AUTH_ENABLED", value = "TRUE" },
        { name = "BASIC_AUTH_USERNAME", value = "admin" },
        # HTTPS設定（本番環境）
        { name = "SECURE_SSL_REDIRECT", value = "TRUE" },
        { name = "SECURE_HSTS_SECONDS", value = "31536000" },
        { name = "SECURE_HSTS_INCLUDE_SUBDOMAINS", value = "TRUE" },
        { name = "SECURE_HSTS_PRELOAD", value = "TRUE" },
        # セッション・CSRF設定（本番環境）
        { name = "SESSION_COOKIE_SECURE", value = "TRUE" },
        { name = "SESSION_COOKIE_AGE", value = "1209600" },
        { name = "CSRF_COOKIE_SECURE", value = "TRUE" },
      ]
      secrets = [
        { name = "POSTGRES_PASSWORD", valueFrom = aws_secretsmanager_secret.db_password.arn },
        { name = "PINECONE_API_KEY", valueFrom = aws_secretsmanager_secret.pinecone_api_key.arn },
        { name = "DJANGO_SECRET_KEY", valueFrom = aws_secretsmanager_secret.django_secret_key.arn },
        { name = "MAILGUN_API_KEY", valueFrom = aws_secretsmanager_secret.mailgun_api_key.arn },
        { name = "BASIC_AUTH_PASSWORD", valueFrom = aws_secretsmanager_secret.basic_auth_password.arn },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.ecs.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "worker"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "worker" {
  name            = "${var.project}-${var.environment}-worker"
  cluster         = aws_ecs_cluster.this.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = 1

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 1
  }

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.ecs_service.id]
    assign_public_ip = true
  }
}



