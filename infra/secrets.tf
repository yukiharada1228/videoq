# Secrets Manager
#
# External service credentials (Neon / Cloudflare R2) are set manually via CLI
# after the initial apply. No secret versions are managed here.

# Neon PostgreSQL connection string.
# Format: {"DATABASE_URL": "postgresql://...?sslmode=require"}
resource "aws_secretsmanager_secret" "db" {
  name        = "${local.name_prefix}/${var.env_name}/db"
  description = "Neon PostgreSQL DATABASE_URL (pooler endpoint)"

  lifecycle {
    prevent_destroy = true
  }
}

# App secrets + R2 credentials.
# Worker runtime and R2 credentials are stored together;
# every key is expanded into the environment by the app secret handler.
resource "aws_secretsmanager_secret" "app" {
  name        = "${local.name_prefix}/${var.env_name}/app"
  description = "App secrets + R2 credentials"

  lifecycle {
    prevent_destroy = true
  }
}
