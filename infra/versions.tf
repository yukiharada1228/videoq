terraform {
  # 1.11+: S3 backend の use_lockfile (ネイティブロック) を使用。
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
