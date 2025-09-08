output "region" {
  value = var.aws_region
}

output "alb_dns_name" {
  value       = aws_lb.web.dns_name
  description = "Public DNS name of the ALB"
}

output "rds_endpoint" {
  value       = aws_db_instance.postgres.address
  description = "Endpoint of the PostgreSQL RDS instance"
}

output "rds_db_name" {
  value       = aws_db_instance.postgres.db_name
  description = "Database name"
}



