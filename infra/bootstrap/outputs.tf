output "state_bucket" {
  description = "本体 backend.tf の bucket に設定する値"
  value       = aws_s3_bucket.state.id
}
