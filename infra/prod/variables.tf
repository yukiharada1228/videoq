variable "project" {
  description = "Project name used as a prefix for resources"
  type        = string
  default     = "videoq"
}

variable "environment" {
  description = "Deployment environment (e.g. dev, stg, prod)"
  type        = string
  default     = "prod"
}

variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "ap-northeast-1"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "db_name" {
  description = "Initial database name"
  type        = string
  default     = "appdb"
}

variable "db_username" {
  description = "Master username for RDS"
  type        = string
  default     = "appuser"
}

variable "pinecone_api_key" {
  description = "Pinecone API Key (provide via tfvars or environment)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "pinecone_environment" {
  description = "Pinecone environment or region"
  type        = string
  default     = ""
}

variable "mailgun_api_key" {
  description = "Mailgun API Key (provide via tfvars or environment)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "mailgun_sender_domain" {
  description = "Mailgun sender domain (e.g. mg.example.com)"
  type        = string
  default     = ""
}

variable "basic_auth_password" {
  description = "Basic auth password for the app"
  type        = string
  default     = ""
  sensitive   = true
}

variable "zone_domain" {
  description = "Hosted Zone apex domain (e.g. videoq.jp)"
  type        = string
  default     = "videoq.jp"
}

variable "domain_name" {
  description = "Application FQDN (e.g. dev.videoq.jp)"
  type        = string
  default     = "videoq.jp"
}

variable "enable_https" {
  description = "Enable ALB HTTPS listener and HTTP->HTTPS redirect"
  type        = bool
  default     = false
}

variable "rds_multi_az" {
  description = "Enable Multi-AZ for RDS (costs more)"
  type        = bool
  default     = false
}


