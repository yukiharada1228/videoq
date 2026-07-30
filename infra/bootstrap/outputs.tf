output "state_bucket" {
  description = "本体 backend.tf の bucket に設定する値"
  value       = aws_s3_bucket.state.id
}

output "lock_table" {
  description = "本体 backend.tf の dynamodb_table に設定する値"
  value       = aws_dynamodb_table.lock.name
}

output "region" {
  description = "本体 backend.tf の region に設定する値"
  value       = var.aws_region
}
