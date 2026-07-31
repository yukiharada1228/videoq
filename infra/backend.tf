# Terraform state backend (S3 + ネイティブロック)。
#
# bucket は infra/bootstrap を一度 apply して作成する。ロックは S3 の
# 条件付き書き込みを使う use_lockfile 方式 (Terraform 1.11+)。DynamoDB は不要。
#
# bucket 名にはアカウント ID が含まれるため、public リポジトリに含めないよう
# backend ブロックには書かず、init 時に -backend-config で注入する。
#   - ローカル: cp backend.hcl.example backend.hcl で bucket を記入し
#               terraform init -backend-config=backend.hcl
#   - CI:       terraform init -backend-config="bucket=$TF_STATE_BUCKET"
# (backend.hcl は .gitignore 済み。region は非機密なのでここに残す。)

terraform {
  backend "s3" {
    key          = "videoq/prod/terraform.tfstate"
    region       = "ap-northeast-1"
    use_lockfile = true
    encrypt      = true
    # bucket は -backend-config で注入
  }
}
