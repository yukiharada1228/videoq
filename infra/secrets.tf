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

# App secrets + R2 credentials for the SQS Lambda worker.
#
# Expected JSON keys (set via CLI / Console — not Terraform-managed versions):
#
#   OPENAI_API_KEY
#   USER_SECRET_ENCRYPTION_KEY
#   R2_ACCESS_KEY_ID          # Cloudflare R2 S3 API token (NOT Lambda role keys)
#   R2_SECRET_ACCESS_KEY
#   R2_BUCKET_NAME            # e.g. videoq-media-prod
#   R2_S3_ENDPOINT            # https://<accountid>.r2.cloudflarestorage.com
#   R2_S3_REGION              # usually "auto"
#
# Do NOT store R2 credentials as AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY.
# Lambda injects those names for the execution role; colliding names are skipped
# or break AWS API calls (SQS / Secrets Manager).
resource "aws_secretsmanager_secret" "app" {
  name        = "${local.name_prefix}/${var.env_name}/app"
  description = "App secrets + R2 credentials (use R2_* key names, never AWS_ACCESS_KEY_ID)"

  lifecycle {
    prevent_destroy = true
  }
}
