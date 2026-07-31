# Terraform state backend bootstrap.
#
# This configuration creates the S3 bucket that stores state. Bootstrap's own
# state is placed in that bucket through a self-referential backend. This keeps
# state persistent and shared in S3 without committing tfstate to the public
# repository. Native S3 locking (use_lockfile) removes the need for DynamoDB.
# Because the bucket name includes the account ID, omit it from the backend and
# inject it at init time with -backend-config (copy backend.hcl.example to backend.hcl).
#
# Once the bucket exists and the backend is enabled, normally run:
#   terraform init -backend-config=backend.hcl && terraform plan/apply
#
# Only when bootstrapping a new account from scratch, before the bucket exists:
#   1. Temporarily comment out the backend "s3" block below.
#   2. Run terraform init && terraform apply to create the bucket with local state.
#   3. Restore the backend "s3" block and enter the bucket name in backend.hcl.
#   4. Run terraform init -migrate-state -backend-config=backend.hcl to move the state.

terraform {
  required_version = ">= 1.11"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    key          = "videoq/bootstrap/terraform.tfstate"
    region       = "ap-northeast-1"
    use_lockfile = true
    encrypt      = true
    # Inject bucket with -backend-config.
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

locals {
  # Add the account ID because S3 bucket names must be globally unique.
  state_bucket_name = "videoq-terraform-state-${data.aws_caller_identity.current.account_id}"
}

# ── State storage bucket ──────────────────────────────────────────────────────
resource "aws_s3_bucket" "state" {
  bucket = local.state_bucket_name

  # Prevent accidental deletion; destroying this bucket loses resource tracking.
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
