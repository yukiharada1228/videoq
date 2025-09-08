data "aws_iam_policy_document" "ecs_task_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_task_execution" {
  name               = "${var.project}-${var.environment}-ecs-task-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume.json
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "ecs_task_role" {
  name               = "${var.project}-${var.environment}-ecs-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume.json
}

data "aws_iam_policy_document" "ecs_read_secrets" {
  statement {
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret"
    ]
    resources = [
      aws_secretsmanager_secret.db_password.arn,
      aws_secretsmanager_secret.pinecone_api_key.arn,
      aws_secretsmanager_secret.django_secret_key.arn,
      aws_secretsmanager_secret.mailgun_api_key.arn,
      aws_secretsmanager_secret.basic_auth_password.arn
    ]
  }
}

resource "aws_iam_policy" "ecs_read_secrets" {
  name   = "${var.project}-${var.environment}-ecs-read-secrets"
  policy = data.aws_iam_policy_document.ecs_read_secrets.json
}

resource "aws_iam_role_policy_attachment" "ecs_read_secrets" {
  role       = aws_iam_role.ecs_task_role.name
  policy_arn = aws_iam_policy.ecs_read_secrets.arn
}

# Execution role also needs to read secrets to inject env at task start
resource "aws_iam_role_policy_attachment" "ecs_exec_read_secrets" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = aws_iam_policy.ecs_read_secrets.arn
}

data "aws_iam_policy_document" "ecs_s3_access" {
  statement {
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket"
    ]
    resources = [
      aws_s3_bucket.app.arn,
      "${aws_s3_bucket.app.arn}/*"
    ]
  }
}

resource "aws_iam_policy" "ecs_s3_access" {
  name   = "${var.project}-${var.environment}-ecs-s3-access"
  policy = data.aws_iam_policy_document.ecs_s3_access.json
}

resource "aws_iam_role_policy_attachment" "ecs_s3_access" {
  role       = aws_iam_role.ecs_task_role.name
  policy_arn = aws_iam_policy.ecs_s3_access.arn
}


