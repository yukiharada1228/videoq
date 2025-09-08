resource "aws_secretsmanager_secret" "db_password" {
  name        = "${var.project}/${var.environment}/db_password"
  description = "RDS master password"
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.rds_master.result
}

resource "aws_secretsmanager_secret" "pinecone_api_key" {
  name        = "${var.project}/${var.environment}/pinecone_api_key"
  description = "Pinecone API key"
}

resource "aws_secretsmanager_secret_version" "pinecone_api_key" {
  count         = var.pinecone_api_key != "" ? 1 : 0
  secret_id     = aws_secretsmanager_secret.pinecone_api_key.id
  secret_string = var.pinecone_api_key
}

# Django Secret Key
resource "random_password" "django_secret" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "django_secret_key" {
  name        = "${var.project}/${var.environment}/django_secret_key"
  description = "Django SECRET_KEY"
}

resource "aws_secretsmanager_secret_version" "django_secret_key" {
  secret_id     = aws_secretsmanager_secret.django_secret_key.id
  secret_string = random_password.django_secret.result
}

# Mailgun
resource "aws_secretsmanager_secret" "mailgun_api_key" {
  name        = "${var.project}/${var.environment}/mailgun_api_key"
  description = "Mailgun API key"
}

resource "aws_secretsmanager_secret_version" "mailgun_api_key" {
  count         = var.mailgun_api_key != "" ? 1 : 0
  secret_id     = aws_secretsmanager_secret.mailgun_api_key.id
  secret_string = var.mailgun_api_key
}

# Basic auth password
resource "aws_secretsmanager_secret" "basic_auth_password" {
  name        = "${var.project}/${var.environment}/basic_auth_password"
  description = "Basic auth password"
}

resource "aws_secretsmanager_secret_version" "basic_auth_password" {
  count         = var.basic_auth_password != "" ? 1 : 0
  secret_id     = aws_secretsmanager_secret.basic_auth_password.id
  secret_string = var.basic_auth_password
}
