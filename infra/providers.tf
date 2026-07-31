provider "aws" {
  region = var.aws_region
}

# OpenAI Administration API プロバイダ。OPENAI_ADMIN_KEY を環境変数から読む。
# var.manage_openai_project = false のときは全リソース count=0 なので Admin キー不要。
provider "openai" {}
