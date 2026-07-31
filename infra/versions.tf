terraform {
  # 1.11+: Use native locking through use_lockfile in the S3 backend.
  required_version = ">= 1.11"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    openai = {
      source  = "openai/openai"
      version = ">= 1.0.0"
    }
  }
}
