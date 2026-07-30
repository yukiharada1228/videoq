# Terraform state backend (S3 + ネイティブロック)。
#
# bucket は infra/bootstrap を一度 apply して作成する。ロックは S3 の
# 条件付き書き込みを使う use_lockfile 方式 (Terraform 1.11+)。DynamoDB は不要。
# backend ブロックは変数を展開できないため値はハードコード (アカウント
# 257240362763 / ap-northeast-1)。別アカウントで使う場合は書き換えること。
#
# 初期化:
#   1. cd infra/bootstrap && terraform init && terraform apply   # 一度だけ (バケット作成)
#   2. cd infra && terraform init                                # backend を初期化

terraform {
  backend "s3" {
    bucket       = "videoq-terraform-state-257240362763"
    key          = "videoq/prod/terraform.tfstate"
    region       = "ap-northeast-1"
    use_lockfile = true
    encrypt      = true
  }
}
