# Terraform state backend (S3 + DynamoDB ロック)。
#
# bucket / dynamodb_table は infra/bootstrap を一度 apply して作成する。
# backend ブロックは変数を展開できないため値はハードコード (アカウント
# 257240362763 / ap-northeast-1)。別アカウントで使う場合は書き換えること。
#
# 初期化:
#   1. cd infra/bootstrap && terraform init && terraform apply   # 一度だけ
#   2. cd infra && terraform init                                # backend を初期化
#      (既存のローカル state から移行する場合は terraform init -migrate-state)

terraform {
  backend "s3" {
    bucket         = "videoq-terraform-state-257240362763"
    key            = "videoq/prod/terraform.tfstate"
    region         = "ap-northeast-1"
    dynamodb_table = "videoq-terraform-lock"
    encrypt        = true
  }
}
