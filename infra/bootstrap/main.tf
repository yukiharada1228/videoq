# Terraform state backend bootstrap.
#
# この構成だけはローカル state で管理する (state 保存先そのものを作るため、
# S3 backend を使う本体構成とは循環参照になる)。一度だけ apply すれば、
# 以降は ../backend.tf が参照する S3 バケットが揃う。ロックは S3 ネイティブ
# (use_lockfile) を使うため DynamoDB テーブルは不要。
#
# 使い方:
#   cd infra/bootstrap
#   terraform init
#   terraform apply
#   # 出力された bucket / lock_table 名を ../backend.tf に反映して
#   # 本体側で `terraform init -migrate-state` を実行する。

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  # bootstrap 自体はローカル state (このディレクトリの terraform.tfstate)。
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

locals {
  # S3 バケット名はグローバル一意が必要なのでアカウント ID を付与。
  state_bucket_name = "videoq-terraform-state-${data.aws_caller_identity.current.account_id}"
}

# ── state 保存バケット ────────────────────────────────────────────────────────
resource "aws_s3_bucket" "state" {
  bucket = local.state_bucket_name

  # 誤削除防止。state が入るバケットなので破棄されると全リソースの追跡を失う。
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
