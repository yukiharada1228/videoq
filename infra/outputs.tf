output "db_secret_arn" {
  description = "Neon DB secret ARN"
  value       = aws_secretsmanager_secret.db.arn
}

output "app_secret_arn" {
  description = "App + R2 secrets ARN"
  value       = aws_secretsmanager_secret.app.arn
}

output "worker_ecr_uri" {
  description = "Worker Lambda ECR URI"
  value       = aws_ecr_repository.worker.repository_url
}

output "openai_project_id" {
  description = "Terraform 管理下の OpenAI プロジェクト ID (未管理なら null)"
  value       = try(openai_project.videoq[0].project_id, null)
}
