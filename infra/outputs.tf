output "db_param_name" {
  description = "Neon DB SSM SecureString parameter name"
  value       = aws_ssm_parameter.db.name
}

output "app_param_name" {
  description = "App + R2 SSM SecureString parameter name"
  value       = aws_ssm_parameter.app.name
}

output "worker_ecr_uri" {
  description = "Worker Lambda ECR URI"
  value       = aws_ecr_repository.worker.repository_url
}

output "operations_alert_topic_arn" {
  description = "Lambda/SQS operational alarm notification topic"
  value       = aws_sns_topic.operations.arn
}

output "worker_identity_role_arn" {
  description = "Exact AWS workload subject to register in the OpenRouter federation policy"
  value       = aws_iam_role.worker.arn
}
