output "db_secret_arn" {
  description = "Neon DB secret ARN"
  value       = aws_secretsmanager_secret.db.arn
}

output "app_secret_arn" {
  description = "App + R2 secrets ARN"
  value       = aws_secretsmanager_secret.app.arn
}

output "api_ecr_uri" {
  description = "API Lambda ECR URI"
  value       = aws_ecr_repository.api.repository_url
}

output "worker_ecr_uri" {
  description = "Worker Lambda ECR URI"
  value       = aws_ecr_repository.worker.repository_url
}

output "queue_url" {
  description = "Celery SQS broker queue URL"
  value       = aws_sqs_queue.main.id
}

output "queue_name" {
  description = "Celery SQS broker queue name"
  value       = aws_sqs_queue.main.name
}

output "dlq_url" {
  description = "Dead letter queue URL"
  value       = aws_sqs_queue.dlq.id
}

output "api_endpoint" {
  description = "API Gateway endpoint (Cloudflare Pages の VITE_API_URL に設定)"
  value       = aws_apigatewayv2_api.http.api_endpoint
}

output "worker_lambda_arn" {
  description = "Worker Lambda ARN"
  value       = aws_lambda_function.worker.arn
}

output "distribution_domain_name" {
  description = "CloudFront ドメイン (DNS の CNAME/ALIAS 先)"
  value       = try(aws_cloudfront_distribution.this[0].domain_name, null)
}

output "distribution_id" {
  description = "CloudFront ディストリビューション ID"
  value       = try(aws_cloudfront_distribution.this[0].id, null)
}
