# Terraform state backend bootstrap.
#
# state 保存先の S3 バケットそのものを作る構成。初回だけローカル state で apply し、
# その後 bootstrap 自身の state を「作ったばかりのバケット」へ移す (自己参照)。
# これで state は S3 上で永続・共有され、public リポジトリに tfstate を置かずに済む。
# ロックは S3 ネイティブ (use_lockfile) を使うため DynamoDB は不要。
#
# 使い方:
#   cd infra/bootstrap
#   terraform init            # ローカル state
#   terraform apply           # バケット作成
#   # ↓ 下の backend "s3" ブロックのコメントを外してから:
#   terraform init -migrate-state   # bootstrap の state をバケットへ移動 (yes)
#
# 以降 bootstrap を触るときは backend が有効なので通常どおり init/plan/apply でよい。

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # 初回 apply 後にコメントを外し、`terraform init -migrate-state` を実行する。
  # 別アカウントで使う場合は bucket 名 (アカウント ID 部分) を書き換えること。
  # backend "s3" {
  #   bucket       = "videoq-terraform-state-257240362763"
  #   key          = "videoq/bootstrap/terraform.tfstate"
  #   region       = "ap-northeast-1"
  #   use_lockfile = true
  #   encrypt      = true
  # }
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
