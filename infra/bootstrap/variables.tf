variable "project" {
  description = "Project name used as a prefix for resources"
  type        = string
  default     = "videoq"
}

variable "environment" {
  description = "Deployment environment (e.g. dev, stg, prod)"
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "ap-northeast-1"
}


